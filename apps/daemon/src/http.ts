import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import os from "node:os";
import crypto from "node:crypto";
import { z } from "zod";
import type { ServerBuildSpec } from "@mgg/shared";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { manager } from "./server-manager.js";
import { docker, hostAvailableMb, runningManagedMemoryMb } from "./docker.js";
import * as files from "./files.js";
import * as backups from "./backups.js";

/** Constant-time bearer-token check (hash to equalise length, avoid timing leak). */
function tokenMatches(presented: string): boolean {
  const a = crypto.createHash("sha256").update(presented).digest();
  const b = crypto.createHash("sha256").update(config.token).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Strip CR/LF/quotes so a filename can't inject extra response headers. */
function safeFilename(name: string): string {
  return (name || "download").replace(/[\r\n"\\]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 200);
}

export function createHttpApp() {
  const app = express();
  // The daemon is a server-to-server control plane (panel + the token-scoped
  // browser WS). Restrict CORS to the configured panel origin.
  app.use(cors({ origin: config.panelUrl || true }));
  app.use(express.json({ limit: "12mb" }));

  // ── auth: every /api route (except health) requires the node bearer token ──
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/api/health") return next();
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || !tokenMatches(token)) return res.status(401).json({ error: "unauthorized" });
    next();
  });

  const wrap =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response) =>
      fn(req, res).catch((e: any) => {
        logger.warn({ e: e?.message, path: req.path }, "route error");
        if (!res.headersSent) res.status(400).json({ error: e?.message ?? "error" });
      });

  // ── health & system ───────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ ok: true, name: "mgg-daemon", version: "1.0.0" }));

  app.get(
    "/api/system",
    wrap(async (_req, res) => {
      let dockerInfo: any = null;
      try {
        dockerInfo = await docker.info();
      } catch {
        /* docker may be unreachable */
      }
      res.json({
        hostname: os.hostname(),
        platform: process.platform,
        cpus: os.cpus().length,
        loadavg: os.loadavg(),
        memTotal: os.totalmem(),
        memFree: os.freemem(),
        memAvailable: (await hostAvailableMb()) * 1024 * 1024,
        runningMemMb: await runningManagedMemoryMb(),
        uptime: os.uptime(),
        publicIp: config.publicIp,
        docker: dockerInfo
          ? { version: dockerInfo.ServerVersion, containers: dockerInfo.Containers, running: dockerInfo.ContainersRunning }
          : null,
      });
    }),
  );

  // ── edge-proxy route discovery (wake-on-join) ───────────────────────────
  app.get(
    "/api/proxy/routes",
    wrap(async (_req, res) => {
      res.json({ routes: manager.listProxyRoutes() });
    }),
  );

  // ── server lifecycle ──────────────────────────────────────────────────
  app.post(
    "/api/servers",
    wrap(async (req, res) => {
      const spec = req.body as ServerBuildSpec;
      if (!spec?.serverId) return res.status(400).json({ error: "missing serverId" });
      // rebuild=0 -> persist the new spec only (applies on next start); otherwise
      // (re)build the container. build runs async; progress streams over install/console.
      const rebuild = req.query.rebuild !== "0";
      manager.register(spec, rebuild).catch((e) => logger.error({ e }, "register failed"));
      res.status(202).json({ accepted: true });
    }),
  );

  app.get(
    "/api/servers/:id",
    wrap(async (req, res) => {
      const snap = manager.getSnapshot(req.params.id!);
      if (!snap) return res.status(404).json({ error: "not registered" });
      res.json({ state: snap.state, stats: snap.stats, players: snap.players });
    }),
  );

  const powerSchema = z.object({ action: z.enum(["start", "stop", "restart", "kill"]) });
  app.post(
    "/api/servers/:id/power",
    wrap(async (req, res) => {
      const { action } = powerSchema.parse(req.body);
      await manager.power(req.params.id!, action);
      res.status(204).end();
    }),
  );

  const cmdSchema = z.object({ command: z.string().min(1).max(2000) });
  app.post(
    "/api/servers/:id/command",
    wrap(async (req, res) => {
      const { command } = cmdSchema.parse(req.body);
      await manager.sendCommand(req.params.id!, command);
      res.status(204).end();
    }),
  );

  app.delete(
    "/api/servers/:id",
    wrap(async (req, res) => {
      await manager.destroy(req.params.id!, req.query.purge === "1");
      res.status(204).end();
    }),
  );

  // ── file manager ──────────────────────────────────────────────────────
  app.get(
    "/api/servers/:id/files",
    wrap(async (req, res) => {
      const dir = String(req.query.path ?? "/");
      res.json({ path: dir, entries: await files.listDir(req.params.id!, dir) });
    }),
  );

  app.get(
    "/api/servers/:id/files/content",
    wrap(async (req, res) => {
      const file = String(req.query.path ?? "");
      res.json({ path: file, content: await files.readFile(req.params.id!, file) });
    }),
  );

  const writeSchema = z.object({ path: z.string().min(1), content: z.string() });
  app.put(
    "/api/servers/:id/files/content",
    wrap(async (req, res) => {
      const { path: p, content } = writeSchema.parse(req.body);
      await files.writeFile(req.params.id!, p, content);
      res.status(204).end();
    }),
  );

  app.post(
    "/api/servers/:id/files/mkdir",
    wrap(async (req, res) => {
      await files.mkdir(req.params.id!, z.object({ path: z.string().min(1) }).parse(req.body).path);
      res.status(204).end();
    }),
  );

  app.post(
    "/api/servers/:id/files/rename",
    wrap(async (req, res) => {
      const { from, to } = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(req.body);
      await files.rename(req.params.id!, from, to);
      res.status(204).end();
    }),
  );

  app.delete(
    "/api/servers/:id/files",
    wrap(async (req, res) => {
      await files.remove(req.params.id!, String(req.query.path ?? ""));
      res.status(204).end();
    }),
  );

  app.get(
    "/api/servers/:id/files/download",
    wrap(async (req, res) => {
      const file = String(req.query.path ?? "");
      const name = safeFilename(file.split("/").pop() || "download");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      files.createDownloadStream(req.params.id!, file).on("error", () => res.destroy()).pipe(res);
    }),
  );

  app.post(
    "/api/servers/:id/files/upload",
    wrap(async (req, res) => {
      const dir = String(req.query.path ?? "/");
      const name = String(req.query.name ?? "upload.bin");
      await files.saveUpload(req.params.id!, dir, name, req);
      res.status(204).end();
    }),
  );

  // Import an existing server from an uploaded archive (.zip / .tar.gz / .tgz / .tar).
  // The body is the raw archive stream (Content-Type is non-JSON, so express.json
  // leaves it untouched). `clear=1` wipes the volume first (keeping .mgg/).
  app.post(
    "/api/servers/:id/import",
    wrap(async (req, res) => {
      const name = String(req.query.name ?? "archive.zip");
      const clear = req.query.clear === "1";
      const result = await files.importArchive(req.params.id!, name, req, { clear });
      res.json(result);
    }),
  );

  // ── backups ───────────────────────────────────────────────────────────
  const backupSchema = z.object({ backupId: z.string().min(1), name: z.string().min(1), ignore: z.array(z.string()).optional() });
  app.post(
    "/api/servers/:id/backups",
    wrap(async (req, res) => {
      const { backupId, name, ignore } = backupSchema.parse(req.body);
      const spec = manager.getSpec(req.params.id!) ?? undefined;
      const meta = await backups.createBackup(req.params.id!, backupId, name, { ignore, spec });
      res.json(meta);
    }),
  );

  app.post(
    "/api/servers/:id/backups/:backupId/restore",
    wrap(async (req, res) => {
      await backups.restoreBackup(req.params.id!, req.params.backupId!);
      res.status(204).end();
    }),
  );

  // Branch a new server from a source server's backup: extract the SOURCE's
  // backup archive into THIS (target) server's volume. Used by the panel clone
  // flow. The target volume dir already exists (the server was just provisioned).
  const cloneFromSchema = z.object({ sourceServerId: z.string().min(1), backupId: z.string().min(1) });
  app.post(
    "/api/servers/:id/clone-from",
    wrap(async (req, res) => {
      const { sourceServerId, backupId } = cloneFromSchema.parse(req.body);
      await backups.cloneFromBackup(sourceServerId, backupId, req.params.id!);
      res.status(204).end();
    }),
  );

  // Promote this (clone) server's files onto its origin (target): stop both, take a
  // reversible backup of the target, then overwrite the target's volume with this
  // server's files. The target keeps its own ports/identity (.mgg/ untouched).
  const promoteSchema = z.object({
    targetId: z.string().min(1),
    backupId: z.string().min(1),
    backupName: z.string().min(1),
  });
  app.post(
    "/api/servers/:id/promote",
    wrap(async (req, res) => {
      const { targetId, backupId, backupName } = promoteSchema.parse(req.body);
      const devId = req.params.id!;
      // Stop both so the files are consistent while we copy (no-op if already off).
      await manager.power(devId, "stop").catch(() => {});
      await manager.power(targetId, "stop").catch(() => {});
      // Reversible safety net: back up the target before overwriting it.
      const targetSpec = manager.getSpec(targetId) ?? undefined;
      const backup = await backups.createBackup(targetId, backupId, backupName, { spec: targetSpec });
      const result = await files.syncVolume(devId, targetId, { clear: true });
      res.json({ backup, files: result.files });
    }),
  );

  app.delete(
    "/api/servers/:id/backups/:backupId",
    wrap(async (req, res) => {
      await backups.deleteBackup(req.params.id!, req.params.backupId!);
      res.status(204).end();
    }),
  );

  app.get(
    "/api/servers/:id/backups/:backupId/download",
    wrap(async (req, res) => {
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(req.params.backupId + ".tar.gz")}"`);
      const stream = await backups.downloadBackup(req.params.id!, req.params.backupId!);
      stream.on("error", () => res.destroy()).pipe(res);
    }),
  );

  return app;
}
