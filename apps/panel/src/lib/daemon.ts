import { SignJWT } from "jose";
import type { Node } from "@prisma/client";
import type { ServerBuildSpec, ServerState, ServerStats, FileEntry, BackupMeta } from "@mgg/shared";

export type NodeLike = Pick<Node, "scheme" | "fqdn" | "daemonPort" | "tokenSecret" | "publicIp">;

export class DaemonClient {
  private base: string;
  constructor(private node: NodeLike) {
    this.base = `${node.scheme}://${node.fqdn}:${node.daemonPort}`;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.node.tokenSecret}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `daemon ${res.status}`;
      try {
        msg = (await res.json())?.error ?? msg;
      } catch {
        /* noop */
      }
      throw new Error(msg);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  health() {
    return this.req<{ ok: boolean }>("GET", "/api/health");
  }
  system() {
    return this.req<any>("GET", "/api/system");
  }
  /**
   * Send the build spec to the node. With `rebuild: false` the node only updates
   * the persisted spec (applies on next start) instead of force-recreating the
   * container — use that for env-only changes (mods, startup variables) so a
   * running server isn't killed out from under players on every edit.
   */
  registerServer(spec: ServerBuildSpec, rebuild = true) {
    return this.req<{ accepted: boolean }>("POST", `/api/servers${rebuild ? "" : "?rebuild=0"}`, spec);
  }
  status(serverId: string) {
    return this.req<{ state: ServerState; stats: ServerStats | null; players: unknown }>(
      "GET",
      `/api/servers/${serverId}`,
    );
  }
  power(serverId: string, action: string) {
    return this.req<void>("POST", `/api/servers/${serverId}/power`, { action });
  }
  command(serverId: string, command: string) {
    return this.req<void>("POST", `/api/servers/${serverId}/command`, { command });
  }
  destroy(serverId: string, purge = false) {
    return this.req<void>("DELETE", `/api/servers/${serverId}${purge ? "?purge=1" : ""}`);
  }

  // files
  listFiles(serverId: string, path: string) {
    return this.req<{ path: string; entries: FileEntry[] }>(
      "GET",
      `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
    );
  }
  readFile(serverId: string, path: string) {
    return this.req<{ path: string; content: string }>(
      "GET",
      `/api/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`,
    );
  }
  writeFile(serverId: string, path: string, content: string) {
    return this.req<void>("PUT", `/api/servers/${serverId}/files/content`, { path, content });
  }
  mkdir(serverId: string, path: string) {
    return this.req<void>("POST", `/api/servers/${serverId}/files/mkdir`, { path });
  }
  renameFile(serverId: string, from: string, to: string) {
    return this.req<void>("POST", `/api/servers/${serverId}/files/rename`, { from, to });
  }
  deleteFile(serverId: string, path: string) {
    return this.req<void>("DELETE", `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
  }

  /**
   * Import an existing server: stream an uploaded archive straight through to the
   * node, which extracts it into the server volume. `body` is forwarded as-is
   * (a web ReadableStream from the incoming request) without buffering.
   */
  async importArchive(
    serverId: string,
    filename: string,
    body: ReadableStream<Uint8Array> | Buffer,
    clear: boolean,
  ): Promise<{ files: number }> {
    const url = `${this.base}/api/servers/${serverId}/import?name=${encodeURIComponent(filename)}&clear=${clear ? 1 : 0}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.node.tokenSecret}`, "Content-Type": "application/octet-stream" },
      body: body as any,
      // Required by undici to stream a request body.
      duplex: "half",
      cache: "no-store",
    } as RequestInit & { duplex: "half" });
    if (!res.ok) {
      let msg = `daemon ${res.status}`;
      try {
        msg = (await res.json())?.error ?? msg;
      } catch {
        /* noop */
      }
      throw new Error(msg);
    }
    return (await res.json()) as { files: number };
  }

  /** Raw streaming download of a server file (returns the fetch Response to pipe through). */
  downloadFile(serverId: string, path: string): Promise<Response> {
    return fetch(`${this.base}/api/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${this.node.tokenSecret}` },
      cache: "no-store",
    });
  }

  /** Stream-upload a single file into the server's file manager (no buffering). */
  async uploadFile(
    serverId: string,
    dir: string,
    filename: string,
    body: ReadableStream<Uint8Array> | Buffer,
  ): Promise<void> {
    const url = `${this.base}/api/servers/${serverId}/files/upload?path=${encodeURIComponent(dir)}&name=${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.node.tokenSecret}`, "Content-Type": "application/octet-stream" },
      body: body as any,
      duplex: "half",
      cache: "no-store",
    } as RequestInit & { duplex: "half" });
    if (!res.ok) {
      let msg = `daemon ${res.status}`;
      try {
        msg = (await res.json())?.error ?? msg;
      } catch {
        /* noop */
      }
      throw new Error(msg);
    }
  }

  // backups
  createBackup(serverId: string, backupId: string, name: string, ignore?: string[]) {
    return this.req<BackupMeta>("POST", `/api/servers/${serverId}/backups`, { backupId, name, ignore });
  }
  restoreBackup(serverId: string, backupId: string) {
    return this.req<void>("POST", `/api/servers/${serverId}/backups/${backupId}/restore`);
  }
  deleteBackup(serverId: string, backupId: string) {
    return this.req<void>("DELETE", `/api/servers/${serverId}/backups/${backupId}`);
  }

  /**
   * Promote clone `devId` onto its origin `targetId`: the node stops both, backs the
   * target up (reversible), then overwrites the target's volume with the clone's files.
   */
  promote(devId: string, targetId: string, backupId: string, backupName: string) {
    return this.req<{ backup: BackupMeta; files: number }>(
      "POST",
      `/api/servers/${devId}/promote`,
      { targetId, backupId, backupName },
    );
  }

  /** VM disk usage on this node: filesystem totals + per-server volume sizes. */
  storage() {
    return this.req<{
      fs: { totalBytes: number; freeBytes: number; usedBytes: number };
      servers: { id: string; bytes: number }[];
    }>("GET", "/api/storage");
  }

  /** Wipe the ENTIRE installation off this node (stack + volumes + data). Irreversible. */
  selfDestruct() {
    return this.req<{ accepted: boolean }>("POST", "/api/self-destruct");
  }

  /** Pull the latest code from GitHub and rebuild + restart the panel & daemon. */
  selfUpdate() {
    return this.req<{ accepted: boolean }>("POST", "/api/self-update");
  }

  /** Browser-facing WebSocket URL for live console/stats. */
  wsUrl(serverId: string): string {
    const wsScheme = this.node.scheme === "https" ? "wss" : "ws";
    return `${wsScheme}://${this.node.fqdn}:${this.node.daemonPort}/api/servers/${serverId}/ws`;
  }
}

/**
 * Mint a short-lived JWT the browser uses to authenticate to the daemon's
 * WebSocket. Signed with the node's shared secret (HMAC), scoped to one server.
 */
export async function signWsToken(node: NodeLike, serverId: string, scopes: string[]): Promise<string> {
  return new SignJWT({ serverId, scopes })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(node.tokenSecret));
}
