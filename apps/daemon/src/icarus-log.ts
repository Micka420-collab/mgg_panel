import fs from "node:fs";
import fsp from "node:fs/promises";
import { logger } from "./logger.js";

/**
 * Icarus has NO RCON: the dedicated server (Unreal Engine 4.27) exposes no
 * remote command interface at all. The ONLY way to know who is actually
 * connected — with real names and SteamIDs — is to read the server log. A2S
 * (the UDP query) yields a bare player count, nothing more.
 *
 * This module tails `Icarus.log` and reconstructs the live roster, surfacing
 * join / leave / crash events the daemon turns into console lines, panel
 * player names and (optionally) Discord notifications.
 */

export interface IcarusPlayer {
  steamId: string;
  name: string;
  /** epoch ms when we first observed this player connect (best-effort). */
  since: number;
  /** true if this player's SteamID is in the configured admin list. */
  admin: boolean;
}

export type IcarusEvent =
  | { type: "join"; player: IcarusPlayer; online: number; max: number }
  | { type: "leave"; steamId: string; name: string; sessionMs: number; online: number; max: number }
  | { type: "crash"; line: string }
  /** A flood of physics/replication errors (NaN coords) = the whole server lags. */
  | { type: "lagstorm"; rate: number; sustainedSec: number }
  /** A security-relevant anomaly (reconnect spam, etc.) for the dashboard feed. */
  | { type: "security"; category: string; severity: "warning" | "critical"; message: string };

// Player finished connecting — gives SteamID64 (17 digits) + display name.
//   LogConnectedPlayers: Display: ServerTryCompletePlayerInitialisation -
//     PlayerCharacterID: 76561198729653724_2 | PlayerName: Exctoris
const JOIN_RE =
  /ServerTryCompletePlayerInitialisation - PlayerCharacterID:\s*(\d{17})_\d+\s*\|\s*PlayerName:\s*(.+?)\s*$/;
// Connection torn down — one line per real disconnect, carries the SteamID64.
//   LogNet: UNetConnection::Close: [UNetConnection] RemoteAddr: 76561198318712490:17779, ...
const LEAVE_RE = /UNetConnection::Close:.*RemoteAddr:\s*(\d{17}):/;
// Fatal signatures Unreal writes just before the process dies.
const CRASH_RE = /(LowLevelFatalError|Fatal error:|=== Critical error|Assertion failed:|appError)/;
// Runaway per-frame errors that flood the log and tank performance — almost
// always a player/actor stuck at NaN coordinates (fell out of world / glitch).
const SPAM_RE = /nan\(ind\)|Trying to set transform with bad data|is outside world bounds/;
const STORM_RATE = 200; // spam lines/sec sustained ≈ "the whole server is lagging"

/** Strip Steam display-name garbage: Unicode TAG block, zero-width, bidi, controls. */
function cleanName(raw: string): string {
  return raw
    .replace(/[\u{E0000}-\u{E007F}]/gu, "")
    .replace(/[ ­​-‏‪-‮⁠-⁯﻿]/g, "")
    .trim();
}

const SEED_CAP = 120 * 1024 * 1024; // read at most the last 120 MB to rebuild the current roster
const POLL_MS = 4000;

export class IcarusLogTracker {
  private players = new Map<string, IcarusPlayer>();
  private offset = 0;
  private ino = 0;
  private partial = "";
  private timer?: NodeJS.Timeout;
  private stopped = false;
  // lag-storm detection
  private spamSincePoll = 0;
  private stormStartMs = 0;
  private lastLagNotifyMs = 0;
  // reconnect-spam detection (security): recent join timestamps per SteamID
  private joinTimes = new Map<string, number[]>();

  constructor(
    private readonly logPath: string,
    private maxPlayers: number,
    private readonly onEvent: (e: IcarusEvent) => void,
    /** SteamID64s treated as admins (shown in a different colour in the panel). */
    private adminIds: Set<string> = new Set(),
  ) {}

  setAdminIds(ids: Set<string>): void {
    this.adminIds = ids;
    // re-tag the current roster so a config change takes effect without a rejoin
    for (const p of this.players.values()) p.admin = ids.has(p.steamId);
  }

  async start(): Promise<void> {
    await this.seed();
    this.timer = setInterval(() => {
      this.poll().catch((e) => logger.debug({ e, logPath: this.logPath }, "icarus log poll failed"));
    }, POLL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  setMaxPlayers(n: number): void {
    if (n > 0) this.maxPlayers = n;
  }

  snapshot(): { online: number; max: number; sample: string[]; admins: string[] } {
    const players = [...this.players.values()];
    return {
      online: this.players.size,
      max: this.maxPlayers,
      sample: players.map((p) => p.name),
      admins: players.filter((p) => p.admin).map((p) => p.name),
    };
  }

  /** Detailed roster (oldest connection first) for richer panel views. */
  roster(): IcarusPlayer[] {
    return [...this.players.values()].sort((a, b) => a.since - b.since);
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** On attach, rebuild the current roster from the tail of the live log. */
  private async seed(): Promise<void> {
    try {
      const st = await fsp.stat(this.logPath);
      this.ino = Number(st.ino);
      const start = st.size > SEED_CAP ? st.size - SEED_CAP : 0;
      await this.readRange(start, st.size, start > 0, true);
      this.offset = st.size;
    } catch {
      this.offset = 0;
      this.ino = 0;
    }
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    let size = 0;
    let ino = 0;
    try {
      const st = await fsp.stat(this.logPath);
      size = st.size;
      ino = Number(st.ino);
    } catch {
      return; // log not present yet (server still booting / restarting)
    }
    if (ino !== this.ino || size < this.offset) {
      // Rotation or truncation: Icarus renamed the log to a timestamped backup
      // on restart → everyone disconnected. Reset the roster and re-anchor.
      this.players.clear();
      this.ino = ino;
      this.offset = 0;
      this.partial = "";
    }
    this.spamSincePoll = 0;
    if (size > this.offset) {
      await this.readRange(this.offset, size, false, false);
      this.offset = size;
    }
    this.evaluateLagStorm();
  }

  /** Watchdog: if bad-data/NaN log lines flood in, surface a lag-storm event. */
  private evaluateLagStorm(): void {
    const rate = this.spamSincePoll / (POLL_MS / 1000);
    const now = Date.now();
    if (rate >= STORM_RATE) {
      if (!this.stormStartMs) this.stormStartMs = now;
      // throttle notifications to once per 30s while the storm lasts
      if (now - this.lastLagNotifyMs > 30_000) {
        this.lastLagNotifyMs = now;
        this.onEvent({
          type: "lagstorm",
          rate: Math.round(rate),
          sustainedSec: Math.round((now - this.stormStartMs) / 1000),
        });
      }
    } else {
      this.stormStartMs = 0;
    }
  }

  private readRange(start: number, end: number, dropFirstLine: boolean, silent: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (end <= start) return resolve();
      // `end` is inclusive in createReadStream → read bytes [start, end).
      const stream = fs.createReadStream(this.logPath, { start, end: end - 1, encoding: "utf8" });
      let buf = silent ? "" : this.partial;
      if (silent) this.partial = "";
      let first = dropFirstLine;
      stream.on("data", (chunk) => {
        buf += chunk as string;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (first) {
            first = false; // discard the partial first line when seeding mid-file
            continue;
          }
          this.processLine(line.replace(/\r$/, ""), silent);
        }
      });
      stream.on("end", () => {
        this.partial = buf;
        resolve();
      });
      stream.on("error", reject);
    });
  }

  private processLine(line: string, silent: boolean): void {
    if (!silent && SPAM_RE.test(line)) this.spamSincePoll++;
    let m = JOIN_RE.exec(line);
    if (m) {
      const steamId = m[1]!;
      const name = cleanName(m[2]!) || `Joueur ${steamId.slice(-4)}`;
      const existing = this.players.get(steamId);
      const player: IcarusPlayer = {
        steamId,
        name,
        since: existing?.since ?? Date.now(),
        admin: this.adminIds.has(steamId),
      };
      this.players.set(steamId, player);
      if (!silent && !existing) {
        this.onEvent({ type: "join", player, online: this.players.size, max: this.maxPlayers });
        // reconnect-spam: same SteamID connecting repeatedly in a short window
        const now = Date.now();
        const times = (this.joinTimes.get(steamId) ?? []).filter((t) => now - t < 120_000);
        times.push(now);
        this.joinTimes.set(steamId, times.slice(-6));
        if (times.length >= 4) {
          this.onEvent({
            type: "security",
            category: "reconnect-spam",
            severity: "warning",
            message: `${name} (${steamId}) s'est reconnecté ${times.length}× en 2 min`,
          });
        }
      }
      return;
    }
    m = LEAVE_RE.exec(line);
    if (m) {
      const steamId = m[1]!;
      const p = this.players.get(steamId);
      if (p) {
        this.players.delete(steamId);
        if (!silent) {
          this.onEvent({
            type: "leave",
            steamId,
            name: p.name,
            sessionMs: Date.now() - p.since,
            online: this.players.size,
            max: this.maxPlayers,
          });
        }
      }
      return;
    }
    if (!silent && CRASH_RE.test(line)) {
      this.onEvent({ type: "crash", line: line.slice(0, 300) });
    }
  }
}
