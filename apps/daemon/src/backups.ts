import tar from "tar-fs";
import zlib from "node:zlib";
import fs from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import crypto from "node:crypto";
import path from "node:path";
import type { BackupMeta, ServerBuildSpec } from "@mgg/shared";
import { config } from "./config.js";
import { hostVolumePath, rconHost } from "./docker.js";
import { sendRcon } from "./rcon.js";
import { logger } from "./logger.js";
import {
  s3Enabled,
  uploadToS3,
  downloadFromS3,
  streamFromS3,
  deleteFromS3,
  backupKey,
} from "./s3.js";

function backupDir(serverId: string): string {
  return path.join(config.backupDir, serverId);
}
function backupFile(serverId: string, backupId: string): string {
  return path.join(backupDir(serverId), `${backupId}.tar.gz`);
}

/** Flush a Minecraft world to disk via RCON before archiving (prevents corruption). */
async function flush(serverId: string, spec?: ServerBuildSpec) {
  if (!spec?.rcon) return;
  try {
    const host = await rconHost(serverId);
    await sendRcon(host, spec.rcon.port, spec.rcon.password, "save-off");
    await sendRcon(host, spec.rcon.port, spec.rcon.password, "save-all flush");
  } catch (e) {
    logger.warn({ e }, "backup pre-flush failed (continuing)");
  }
}
async function unflush(serverId: string, spec?: ServerBuildSpec) {
  if (!spec?.rcon) return;
  try {
    await sendRcon(await rconHost(serverId), spec.rcon.port, spec.rcon.password, "save-on");
  } catch {
    /* noop */
  }
}

export async function createBackup(
  serverId: string,
  backupId: string,
  name: string,
  opts: { ignore?: string[]; spec?: ServerBuildSpec } = {},
): Promise<BackupMeta> {
  await fs.mkdir(backupDir(serverId), { recursive: true });
  const dest = backupFile(serverId, backupId);
  const src = hostVolumePath(serverId);

  await flush(serverId, opts.spec);
  try {
    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const pack = tar.pack(src, {
        ignore: (name) => (opts.ignore ?? []).some((ig) => name.includes(ig)),
      });
      const gzip = zlib.createGzip({ level: 6 });
      const out = createWriteStream(dest);
      pack.on("error", reject);
      gzip.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve());
      const gz = pack.pipe(gzip);
      gz.on("data", (c: Buffer) => hash.update(c));
      gz.pipe(out);
    });
    const st = await fs.stat(dest);
    // Best-effort off-site copy. Never throws: a failed/disabled S3 just keeps
    // the backup local. storage reflects where an off-site copy lives.
    const offsite = await uploadToS3(dest, backupKey(serverId, backupId));
    return {
      id: backupId,
      name,
      sizeBytes: st.size,
      checksum: hash.digest("hex"),
      createdAt: Date.now(),
      completed: true,
      locked: false,
      storage: offsite ? "s3" : "local",
    };
  } finally {
    await unflush(serverId, opts.spec);
  }
}

/** Ensure a backup's local .tar.gz exists, lazily re-hydrating from S3 if missing. */
async function ensureLocal(serverId: string, backupId: string): Promise<string | null> {
  const file = backupFile(serverId, backupId);
  if (await fs.access(file).then(() => true).catch(() => false)) return file;
  if (s3Enabled() && (await downloadFromS3(backupKey(serverId, backupId), file).catch(() => false))) {
    return file;
  }
  return null;
}

export async function restoreBackup(serverId: string, backupId: string): Promise<void> {
  // Re-hydrate from S3 if the local archive is gone (e.g. node was replaced).
  const file = await ensureLocal(serverId, backupId);
  if (!file) throw new Error("backup archive not found (local or S3)");
  const dest = hostVolumePath(serverId);

  // Crash-safe restore: extract into a TEMP sibling dir first, and only swap it
  // in once the stream has finished without error. A truncated/corrupt archive or
  // a disk-full mid-extract therefore leaves the original volume intact (the old
  // code wiped the live volume before extracting — total data loss on failure).
  const exists = (p: string) => fs.access(p).then(() => true).catch(() => false);
  const tmp = `${dest}.restore-${process.pid}`;
  const old = `${dest}.old-${process.pid}`;
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(tmp, { recursive: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const rs = createReadStream(file);
      const gunzip = zlib.createGunzip();
      const extract = tar.extract(tmp);
      rs.on("error", reject);
      gunzip.on("error", reject);
      extract.on("error", reject);
      extract.on("finish", () => resolve());
      rs.pipe(gunzip).pipe(extract);
    });

    // Preserve the daemon's internal spec dir if the archive didn't include it,
    // so the server stays manageable after a restart.
    if (!(await exists(path.join(tmp, ".mgg"))) && (await exists(path.join(dest, ".mgg")))) {
      await fs.cp(path.join(dest, ".mgg"), path.join(tmp, ".mgg"), { recursive: true });
    }

    // Swap the restored tree in. Same-filesystem renames are atomic and fast.
    await fs.rename(dest, old);
    await fs.rename(tmp, dest);
    await fs.rm(old, { recursive: true, force: true }).catch(() => {});
  } catch (e) {
    // Original volume untouched — just clean up the temp dir.
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

export async function deleteBackup(serverId: string, backupId: string): Promise<void> {
  await fs.rm(backupFile(serverId, backupId), { force: true });
  // Also drop the off-site copy if one exists (best-effort).
  if (s3Enabled()) await deleteFromS3(backupKey(serverId, backupId)).catch(() => {});
}

/**
 * Branch a NEW server from a SOURCE server's backup: extract the source's
 * `backupId` archive into the TARGET server's volume. Same crash-safe swap as
 * restoreBackup (extract into a temp sibling, then atomic rename), but the
 * source and destination are different servers. Re-hydrates the archive from S3
 * if the local copy is gone. Preserves the TARGET's freshly-provisioned
 * `.mgg/` spec dir if the archive doesn't carry one.
 */
export async function cloneFromBackup(
  sourceServerId: string,
  backupId: string,
  targetServerId: string,
): Promise<void> {
  // Locate the source backup archive (local, else re-hydrate from S3).
  const file = backupFile(sourceServerId, backupId);
  const haveLocal = await fs.access(file).then(() => true).catch(() => false);
  if (!haveLocal) {
    if (
      !(s3Enabled() && (await downloadFromS3(backupKey(sourceServerId, backupId), file).catch(() => false)))
    ) {
      throw new Error("source backup archive not found (local or S3)");
    }
  }

  const dest = hostVolumePath(targetServerId);
  const exists = (p: string) => fs.access(p).then(() => true).catch(() => false);
  const tmp = `${dest}.clone-${process.pid}`;
  const old = `${dest}.old-${process.pid}`;
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(tmp, { recursive: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const rs = createReadStream(file);
      const gunzip = zlib.createGunzip();
      const extract = tar.extract(tmp);
      rs.on("error", reject);
      gunzip.on("error", reject);
      extract.on("error", reject);
      extract.on("finish", () => resolve());
      rs.pipe(gunzip).pipe(extract);
    });

    // Keep the target's own daemon spec dir if the archive didn't include one,
    // so the clone stays manageable after a restart.
    if (!(await exists(path.join(tmp, ".mgg"))) && (await exists(path.join(dest, ".mgg")))) {
      await fs.cp(path.join(dest, ".mgg"), path.join(tmp, ".mgg"), { recursive: true });
    }

    await fs.mkdir(dest, { recursive: true });
    await fs.rename(dest, old);
    await fs.rename(tmp, dest);
    await fs.rm(old, { recursive: true, force: true }).catch(() => {});
  } catch (e) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

/**
 * Stream a backup's bytes. Prefers the local .tar.gz; if it's missing but an
 * off-site copy exists, streams straight from S3 without re-hydrating to disk.
 */
export async function downloadBackup(serverId: string, backupId: string): Promise<Readable> {
  const file = backupFile(serverId, backupId);
  if (await fs.access(file).then(() => true).catch(() => false)) {
    return createReadStream(file);
  }
  if (s3Enabled()) {
    const stream = await streamFromS3(backupKey(serverId, backupId));
    if (stream) return stream;
  }
  // Fall back to the local read stream so the caller gets a clean ENOENT.
  return createReadStream(file);
}
