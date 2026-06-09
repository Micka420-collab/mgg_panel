import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import tar from "tar-fs";
import unzipper from "unzipper";
import type { FileEntry } from "@mgg/shared";
import { hostVolumePath } from "./docker.js";
import { config } from "./config.js";

const SERVER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function within(root: string, p: string): boolean {
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  return p === root || p.startsWith(rootWithSep);
}

/**
 * Resolve a user-supplied relative path against a server's volume root,
 * guaranteeing the result stays inside the jail. Defends against:
 *  - `..` traversal / absolute escapes (lexical check), and
 *  - SYMLINK escapes: the deepest existing ancestor is realpath()'d and
 *    re-validated, so a symlink planted inside the volume pointing outside
 *    cannot be followed by the host-side daemon.
 */
export function safeResolve(serverId: string, rel: string): string {
  if (!SERVER_ID_RE.test(serverId)) throw new Error("invalid server id");
  const root = path.resolve(hostVolumePath(serverId));
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(root, clean);
  if (!within(root, resolved)) throw new Error("path escapes server volume");

  // Symlink-safe re-check against the real filesystem.
  let realRoot: string;
  try {
    realRoot = fsSync.realpathSync(root);
  } catch {
    // volume not created yet (new server) — lexical check already passed
    return resolved;
  }
  let probe = resolved;
  // walk up to the deepest path that actually exists, then realpath it
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const real = fsSync.realpathSync(probe);
      if (!within(realRoot, real)) throw new Error("path escapes server volume (symlink)");
      break;
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        const parent = path.dirname(probe);
        if (parent === probe) break;
        probe = parent;
        continue;
      }
      throw e;
    }
  }
  return resolved;
}

function rel(serverId: string, abs: string): string {
  const root = path.resolve(hostVolumePath(serverId));
  return "/" + path.relative(root, abs).replace(/\\/g, "/");
}

const MIME: Record<string, string> = {
  ".txt": "text/plain", ".log": "text/plain", ".json": "application/json",
  ".yml": "text/yaml", ".yaml": "text/yaml", ".properties": "text/plain",
  ".ini": "text/plain", ".cfg": "text/plain", ".conf": "text/plain",
  ".sh": "text/x-shellscript", ".jar": "application/java-archive",
  ".zip": "application/zip", ".png": "image/png", ".jpg": "image/jpeg",
  ".toml": "text/plain", ".mcfunction": "text/plain", ".md": "text/markdown",
};

export async function listDir(serverId: string, dir: string): Promise<FileEntry[]> {
  const abs = safeResolve(serverId, dir);
  const names = await fs.readdir(abs);
  const entries = await Promise.all(
    names.map(async (name): Promise<FileEntry | null> => {
      const full = path.join(abs, name);
      try {
        const st = await fs.lstat(full);
        return {
          name,
          path: rel(serverId, full),
          isDir: st.isDirectory(),
          size: st.size,
          mode: (st.mode & 0o777).toString(8),
          modifiedAt: st.mtimeMs,
          mime: st.isDirectory() ? undefined : MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream",
        };
      } catch {
        return null;
      }
    }),
  );
  return entries
    .filter((e): e is FileEntry => e !== null)
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
}

const MAX_EDIT_BYTES = 8 * 1024 * 1024; // 8 MB editable cap

export async function readFile(serverId: string, file: string): Promise<string> {
  const abs = safeResolve(serverId, file);
  const st = await fs.stat(abs);
  if (st.size > MAX_EDIT_BYTES) throw new Error("file too large to edit in the browser");
  return fs.readFile(abs, "utf8");
}

export async function writeFile(serverId: string, file: string, content: string): Promise<void> {
  const abs = safeResolve(serverId, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

export async function mkdir(serverId: string, dir: string): Promise<void> {
  await fs.mkdir(safeResolve(serverId, dir), { recursive: true });
}

export async function rename(serverId: string, from: string, to: string): Promise<void> {
  await fs.rename(safeResolve(serverId, from), safeResolve(serverId, to));
}

export async function remove(serverId: string, target: string): Promise<void> {
  await fs.rm(safeResolve(serverId, target), { recursive: true, force: true });
}

export function createDownloadStream(serverId: string, file: string) {
  return createReadStream(safeResolve(serverId, file));
}

export async function saveUpload(serverId: string, dir: string, filename: string, source: NodeJS.ReadableStream) {
  const safeName = path.basename(filename);
  const abs = safeResolve(serverId, path.join(dir, safeName));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(abs);
    source.pipe(ws);
    ws.on("finish", () => resolve());
    ws.on("error", reject);
    source.on("error", reject);
  });
}

const ARCHIVE_RE = /\.(zip|tar\.gz|tgz|tar)$/i;
// Import limits — bound disk usage so an over-large archive or a zip/gzip bomb
// can't fill the shared host disk (taking down every server on the node).
const MAX_UPLOAD_BYTES = 4 * 1024 ** 3; // compressed upload cap
const MAX_TOTAL_BYTES = 12 * 1024 ** 3; // decompressed cap (actual bytes written)
const MAX_ENTRIES = 50_000;

/** A Transform that errors once more than `limit` bytes have passed through it. */
function byteCap(getCount: () => number, addCount: (n: number) => void, limit: number, label: string) {
  return new Transform({
    transform(chunk, _enc, cb) {
      addCount(chunk.length);
      if (getCount() > limit) return cb(new Error(`${label} exceeds the ${Math.round(limit / 1024 ** 3)} GB limit`));
      cb(null, chunk);
    },
  });
}

/**
 * Import an existing server: accept an uploaded archive (.zip / .tar.gz / .tgz / .tar)
 * and extract it into the server's volume — the core of "bring your own server".
 *
 * Safety:
 *  - extraction happens in an isolated temp dir, with a per-entry zip-slip guard
 *    (entries resolving outside the temp dir are skipped); tar-fs v3 blocks
 *    traversal natively.
 *  - a single wrapping top-level folder is stripped, so an archive of
 *    "MyServer/world/…" lands as "world/…" (the common case for hand-zipped servers).
 *  - `clear` wipes the destination first but always preserves the internal
 *    `.mgg/` spec dir the daemon needs to manage the server.
 */
export async function importArchive(
  serverId: string,
  filename: string,
  source: NodeJS.ReadableStream,
  opts: { clear?: boolean } = {},
): Promise<{ files: number }> {
  if (!SERVER_ID_RE.test(serverId)) throw new Error("invalid server id");
  if (!ARCHIVE_RE.test(filename)) throw new Error("unsupported archive — use .zip, .tar.gz, .tgz or .tar");
  const root = path.resolve(hostVolumePath(serverId));
  await fs.mkdir(root, { recursive: true });

  const lower = filename.toLowerCase();
  const isZip = lower.endsWith(".zip");
  const stamp = `${process.pid}-${serverId}`;
  const tmpFile = path.join(config.dataDir, `.import-${stamp}${isZip ? ".zip" : ".tar"}`);
  const tmpDir = path.join(config.dataDir, `.import-${stamp}.d`);

  // 1. stream the upload to a temp file (capped so a giant upload can't fill disk)
  let uploaded = 0;
  await pipeline(
    source,
    byteCap(() => uploaded, (n) => (uploaded += n), MAX_UPLOAD_BYTES, "uploaded archive"),
    createWriteStream(tmpFile),
  );

  try {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(tmpDir, { recursive: true });
    const realTmp = fsSync.realpathSync(tmpDir);

    // Cumulative decompressed-byte counter shared across all entries — guards
    // against zip/gzip bombs that expand far beyond the (capped) upload size.
    let written = 0;
    const cap = () => byteCap(() => written, (n) => (written += n), MAX_TOTAL_BYTES, "decompressed archive");

    // 2. extract into the isolated temp dir (path-traversal + size guarded)
    if (isZip) {
      const directory = await unzipper.Open.file(tmpFile);
      let entries = 0;
      for (const entry of directory.files) {
        if (entry.type !== "File") continue;
        if (++entries > MAX_ENTRIES) throw new Error(`archive has too many files (> ${MAX_ENTRIES})`);
        const dest = path.resolve(realTmp, entry.path);
        if (!within(realTmp, dest)) continue; // zip-slip: entry escapes the temp dir — skip it
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await pipeline(entry.stream(), cap(), createWriteStream(dest));
      }
    } else {
      const rs = createReadStream(tmpFile);
      const extract = tar.extract(realTmp); // tar-fs v3 rejects entries that escape
      if (lower.endsWith(".tar")) {
        await pipeline(rs, cap(), extract);
      } else {
        await pipeline(rs, zlib.createGunzip(), cap(), extract);
      }
    }

    // 3. strip a single wrapping directory if that's all the archive contains
    let srcRoot = realTmp;
    const top = (await fs.readdir(realTmp, { withFileTypes: true })).filter(
      (e) => e.name !== "__MACOSX" && !e.name.startsWith("._"),
    );
    if (top.length === 1 && top[0]!.isDirectory()) srcRoot = path.join(realTmp, top[0]!.name);

    // 4. optionally clear the destination (but keep the internal spec dir)
    if (opts.clear) {
      for (const entry of await fs.readdir(root)) {
        if (entry === ".mgg") continue;
        await fs.rm(path.join(root, entry), { recursive: true, force: true });
      }
    }

    // 5. merge the extracted tree into the volume, overwriting collisions
    let files = 0;
    const copyInto = async (dir: string, dest: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name === "__MACOSX" || e.name === ".mgg") continue;
        const from = path.join(dir, e.name);
        const to = path.join(dest, e.name);
        if (e.isDirectory()) {
          await fs.mkdir(to, { recursive: true });
          await copyInto(from, to);
        } else if (e.isFile()) {
          await fs.copyFile(from, to);
          files++;
        }
      }
    };
    await copyInto(srcRoot, root);
    return { files };
  } finally {
    await fs.rm(tmpFile, { force: true }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Copy one server's volume contents onto another's — the primitive behind
 * "push to origin" (promote a clone's files back to its source). The internal
 * `.mgg/` spec dir is NEVER copied or removed, so the destination keeps its
 * own identity (ports, spec). With `clear`, the destination is wiped first
 * (except `.mgg/`). Symlinks/special files are skipped. Caller should stop
 * both containers and back up the destination first (the /promote route does).
 */
export async function syncVolume(
  srcId: string,
  dstId: string,
  opts: { clear?: boolean } = {},
): Promise<{ files: number }> {
  if (!SERVER_ID_RE.test(srcId) || !SERVER_ID_RE.test(dstId)) throw new Error("invalid server id");
  if (srcId === dstId) throw new Error("source and destination are the same server");
  const src = path.resolve(hostVolumePath(srcId));
  const dst = path.resolve(hostVolumePath(dstId));
  await fs.access(src); // source volume must exist
  await fs.mkdir(dst, { recursive: true });

  if (opts.clear) {
    for (const name of await fs.readdir(dst)) {
      if (name === ".mgg") continue;
      await fs.rm(path.join(dst, name), { recursive: true, force: true });
    }
  }

  let files = 0;
  const walk = async (from: string, to: string): Promise<void> => {
    await fs.mkdir(to, { recursive: true });
    for (const e of await fs.readdir(from, { withFileTypes: true })) {
      if (e.name === ".mgg") continue; // never carry over the daemon's spec dir
      const f = path.join(from, e.name);
      const t = path.join(to, e.name);
      if (e.isDirectory()) await walk(f, t);
      else if (e.isFile()) {
        await fs.copyFile(f, t);
        files++;
      }
      // symlinks / special files are intentionally skipped
    }
  };
  await walk(src, dst);
  return { files };
}

/** Filesystem usage of the node's data volume — the VM disk that holds game data. */
export async function diskUsage(): Promise<{ totalBytes: number; freeBytes: number; usedBytes: number }> {
  const st = await fs.statfs(config.dataDir);
  const totalBytes = Number(st.blocks) * st.bsize;
  const freeBytes = Number(st.bfree) * st.bsize;
  return { totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes) };
}

/** Per-server volume sizes (bytes) by scanning the data dir — for the storage page. */
export async function perServerSizes(): Promise<{ id: string; bytes: number }[]> {
  let ids: string[] = [];
  try {
    ids = await fs.readdir(config.dataDir);
  } catch {
    return [];
  }
  const out: { id: string; bytes: number }[] = [];
  for (const id of ids) {
    if (!SERVER_ID_RE.test(id)) continue;
    try {
      const st = await fs.stat(path.join(config.dataDir, id));
      if (st.isDirectory()) out.push({ id, bytes: await volumeSize(id) });
    } catch {
      /* skip unreadable entries */
    }
  }
  return out;
}

/** Best-effort recursive disk usage of the server's volume, in bytes. */
export async function volumeSize(serverId: string): Promise<number> {
  const root = hostVolumePath(serverId);
  let total = 0;
  async function walk(dir: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      try {
        if (e.isDirectory()) await walk(full);
        else if (e.isFile()) total += (await fs.stat(full)).size;
      } catch {
        /* skip */
      }
    }
  }
  await walk(root);
  return total;
}
