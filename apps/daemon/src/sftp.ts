// ssh2 is CommonJS — import the default export and destructure. Named ESM
// imports ("import { Server } from 'ssh2'") fail at runtime in a "type":"module"
// package: "Named export 'Server' not found".
import ssh2 from "ssh2";
const { Server, utils } = ssh2;
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { safeResolve } from "./files.js";

const { STATUS_CODE, OPEN_MODE } = utils.sftp;

interface Session {
  serverId: string;
  writable: boolean;
  deletable: boolean;
}

/** Load the SSH host key, generating one on first run. */
async function hostKey(): Promise<string> {
  try {
    return await fsp.readFile(config.hostKeyPath, "utf8");
  } catch {
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    await fsp.mkdir(path.dirname(config.hostKeyPath), { recursive: true });
    await fsp.writeFile(config.hostKeyPath, privateKey, { mode: 0o600 });
    logger.info("generated SFTP host key");
    return privateKey;
  }
}

async function panelAuth(username: string, password: string): Promise<Session | null> {
  try {
    const res = await fetch(`${config.panelUrl}/api/remote/sftp-auth`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Session;
  } catch (e) {
    logger.warn({ e }, "sftp panel auth failed");
    return null;
  }
}

function attrsFor(st: fs.Stats) {
  return { mode: st.mode, uid: 0, gid: 0, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) };
}

function longname(name: string, st: fs.Stats): string {
  const dir = st.isDirectory() ? "d" : "-";
  const size = String(st.size).padStart(8);
  return `${dir}rw-r--r-- 1 mgg mgg ${size} ${name}`;
}

export async function startSftp(): Promise<void> {
  if (!config.sftpPort) return;
  const key = await hostKey();

  const server = new Server({ hostKeys: [key] }, (client) => {
    let session: Session | null = null;

    client.on("authentication", async (ctx) => {
      if (ctx.method !== "password") return ctx.reject(["password"]);
      const s = await panelAuth(ctx.username, ctx.password);
      if (!s) return ctx.reject();
      session = s;
      ctx.accept();
    });

    client.on("ready", () => {
      client.on("session", (acceptSession) => {
        const sess = acceptSession();
        sess.on("sftp", (acceptSftp) => {
          const sftp = acceptSftp();
          if (!session) return;
          const sid = session.serverId;
          const writable = session.writable;
          const deletable = session.deletable;

          // handle registry
          let counter = 0;
          const fileHandles = new Map<number, number>(); // handle id -> fd
          const dirHandles = new Map<number, { path: string; read: boolean }>();
          const newHandle = () => {
            const id = counter++;
            const buf = Buffer.alloc(4);
            buf.writeUInt32BE(id, 0);
            return { id, buf };
          };
          const idOf = (h: Buffer) => h.readUInt32BE(0);

          const resolve = (p: string) => safeResolve(sid, p);

          sftp.on("REALPATH", (reqid, p) => {
            try {
              const abs = resolve(p === "" ? "." : p);
              const root = resolve("/");
              const rel = "/" + path.relative(root, abs).replace(/\\/g, "/");
              sftp.name(reqid, [{ filename: rel === "/" ? "/" : rel, longname: rel, attrs: {} as any }]);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          const doStat = (reqid: number, p: string) => {
            try {
              const st = fs.statSync(resolve(p));
              sftp.attrs(reqid, attrsFor(st) as any);
            } catch {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          };
          sftp.on("STAT", doStat);
          sftp.on("LSTAT", doStat);
          sftp.on("FSTAT", (reqid, h) => {
            const fd = fileHandles.get(idOf(h));
            if (fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);
            try {
              sftp.attrs(reqid, attrsFor(fs.fstatSync(fd)) as any);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("OPENDIR", (reqid, p) => {
            try {
              const abs = resolve(p);
              if (!fs.statSync(abs).isDirectory()) return sftp.status(reqid, STATUS_CODE.FAILURE);
              const { id, buf } = newHandle();
              dirHandles.set(id, { path: p, read: false });
              sftp.handle(reqid, buf);
            } catch {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          });

          sftp.on("READDIR", (reqid, h) => {
            const dh = dirHandles.get(idOf(h));
            if (!dh) return sftp.status(reqid, STATUS_CODE.FAILURE);
            if (dh.read) return sftp.status(reqid, STATUS_CODE.EOF);
            dh.read = true;
            try {
              const abs = resolve(dh.path);
              const names = fs.readdirSync(abs);
              const entries = names.map((name) => {
                let st: fs.Stats;
                try {
                  st = fs.lstatSync(path.join(abs, name));
                } catch {
                  st = fs.statSync(abs);
                }
                return { filename: name, longname: longname(name, st), attrs: attrsFor(st) as any };
              });
              sftp.name(reqid, entries);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("OPEN", (reqid, filename, flags) => {
            try {
              const reading = flags & OPEN_MODE.READ;
              const writing = flags & (OPEN_MODE.WRITE | OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.TRUNC);
              if (writing && !writable) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
              let mode = "r";
              if (writing && reading) mode = "r+";
              else if (flags & OPEN_MODE.APPEND) mode = "a";
              else if (writing) mode = "w";
              const fd = fs.openSync(resolve(filename), mode);
              const { id, buf } = newHandle();
              fileHandles.set(id, fd);
              sftp.handle(reqid, buf);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("READ", (reqid, h, offset, length) => {
            const fd = fileHandles.get(idOf(h));
            if (fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);
            const buf = Buffer.alloc(length);
            fs.read(fd, buf, 0, length, offset, (err, bytes) => {
              if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);
              if (bytes === 0) return sftp.status(reqid, STATUS_CODE.EOF);
              sftp.data(reqid, buf.subarray(0, bytes));
            });
          });

          sftp.on("WRITE", (reqid, h, offset, data) => {
            const fd = fileHandles.get(idOf(h));
            if (fd === undefined || !writable) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            fs.write(fd, data, 0, data.length, offset, (err) => {
              sftp.status(reqid, err ? STATUS_CODE.FAILURE : STATUS_CODE.OK);
            });
          });

          sftp.on("CLOSE", (reqid, h) => {
            const id = idOf(h);
            const fd = fileHandles.get(id);
            if (fd !== undefined) {
              try {
                fs.closeSync(fd);
              } catch {
                /* noop */
              }
              fileHandles.delete(id);
            }
            dirHandles.delete(id);
            sftp.status(reqid, STATUS_CODE.OK);
          });

          sftp.on("MKDIR", (reqid, p) => {
            if (!writable) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            try {
              fs.mkdirSync(resolve(p), { recursive: true });
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("RENAME", (reqid, from, to) => {
            if (!writable) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            try {
              fs.renameSync(resolve(from), resolve(to));
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          const doRemove = (reqid: number, p: string, dir: boolean) => {
            if (!deletable) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
            try {
              if (dir) fs.rmdirSync(resolve(p));
              else fs.unlinkSync(resolve(p));
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          };
          sftp.on("REMOVE", (reqid, p) => doRemove(reqid, p, false));
          sftp.on("RMDIR", (reqid, p) => doRemove(reqid, p, true));

          // accept (but ignore) attribute changes so clients don't error
          sftp.on("SETSTAT", (reqid) => sftp.status(reqid, STATUS_CODE.OK));
          sftp.on("FSETSTAT", (reqid) => sftp.status(reqid, STATUS_CODE.OK));
        });
      });
    });

    client.on("error", (e) => logger.debug({ e }, "sftp client error"));
  });

  server.listen(config.sftpPort, "0.0.0.0", () => {
    logger.info({ port: config.sftpPort }, "🔐 SFTP server online");
  });
}
