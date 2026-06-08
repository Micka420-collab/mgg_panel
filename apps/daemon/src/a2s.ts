import { createSocket } from "node:dgram";

const A2S_INFO_REQUEST = Buffer.concat([
  Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
  Buffer.from("Source Engine Query\0", "ascii"),
]);

function readCString(buf: Buffer, start: number): number {
  let end = start;
  while (end < buf.length && buf[end] !== 0x00) end++;
  return end + 1;
}

function parseInfo(msg: Buffer): { online: number; max: number; sample: string[] } | null {
  try {
    // [0..3]=0xFFFFFFFF, [4]=0x49 header, [5]=protocol, then Name,Map,Folder,Game
    // (NUL-terminated strings), [short]=AppID, Players(u8), MaxPlayers(u8), ...
    let off = 6;
    off = readCString(msg, off); // Name
    off = readCString(msg, off); // Map
    off = readCString(msg, off); // Folder
    off = readCString(msg, off); // Game
    off += 2; // AppID (uint16)
    const online = msg[off];
    const max = msg[off + 1];
    if (online === undefined || max === undefined) return null;
    return { online, max, sample: [] };
  } catch {
    return null;
  }
}

/**
 * Query a Source-engine dedicated server (Garry's Mod, CS, TF2, ...) for its live
 * player count via A2S_INFO over UDP. Source games expose this on the game port,
 * so it works for any template that advertises the "query" feature without RCON.
 * Returns null on timeout/error so the caller keeps the last known value.
 */
export async function queryA2S(
  host: string,
  port: number,
  timeoutMs = 4000,
): Promise<{ online: number; max: number; sample: string[] } | null> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;
    const done = (v: { online: number; max: number; sample: string[] } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);

    socket.on("error", () => done(null));
    socket.on("message", (msg) => {
      const type = msg[4];
      if (type === 0x41) {
        // challenge: resend with the 4-byte challenge appended
        socket.send(Buffer.concat([A2S_INFO_REQUEST, msg.subarray(5, 9)]), port, host);
        return;
      }
      if (type !== 0x49) return done(null);
      done(parseInfo(msg));
    });

    socket.send(A2S_INFO_REQUEST, port, host, (err) => {
      if (err) done(null);
    });
  });
}
