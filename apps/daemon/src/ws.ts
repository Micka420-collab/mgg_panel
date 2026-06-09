import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import {
  hasScope,
  type ConsoleClientMessage,
  type ConsoleServerMessage,
  type Scope,
} from "@mgg/shared";
import { config } from "./config.js";
import { manager } from "./server-manager.js";
import { logger } from "./logger.js";

interface WsClaims {
  serverId: string;
  scopes: string[];
  exp: number;
}

const PATH_RE = /^\/api\/servers\/([^/]+)\/ws$/;

export function attachWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const match = PATH_RE.exec(url.pathname);
    if (!match) {
      socket.destroy();
      return;
    }
    const serverId = decodeURIComponent(match[1]!);
    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, serverId));
  });
}

function send(ws: WebSocket, msg: ConsoleServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handleConnection(ws: WebSocket, serverId: string) {
  let authed = false;
  let scopes: string[] = [];
  let unsub: (() => void) | null = null;

  const authTimer = setTimeout(() => {
    if (!authed) {
      send(ws, { type: "auth.error", message: "authentication timeout" });
      ws.close();
    }
  }, 10_000);

  ws.on("message", async (data) => {
    let msg: ConsoleClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === "auth") {
      try {
        // Pin the algorithm (the panel signs HS256) so a forged token can't pick
        // a different verification scheme; and sanity-check the claims shape.
        const claims = jwt.verify(msg.token, config.token, { algorithms: ["HS256"] }) as WsClaims;
        if (typeof claims.serverId !== "string" || !Array.isArray(claims.scopes ?? [])) throw new Error("invalid token claims");
        if (claims.serverId !== serverId) throw new Error("token/server mismatch");
        if (!manager.has(serverId)) throw new Error("server not registered on this node");
        authed = true;
        scopes = claims.scopes ?? [];
        clearTimeout(authTimer);
        send(ws, { type: "auth.ok", serverId });

        // backlog + current state
        const snap = manager.getSnapshot(serverId);
        if (snap) {
          send(ws, { type: "state", state: snap.state });
          if (snap.console.length) send(ws, { type: "console", lines: snap.console });
          if (snap.stats) send(ws, { type: "stats", stats: snap.stats });
        }

        unsub = manager.subscribe(serverId, {
          onConsole: (lines) => send(ws, { type: "console", lines }),
          onStats: (stats) => send(ws, { type: "stats", stats }),
          onState: (state) => send(ws, { type: "state", state }),
        });
      } catch (e: any) {
        send(ws, { type: "auth.error", message: e?.message ?? "invalid token" });
        ws.close();
      }
      return;
    }

    if (!authed) {
      send(ws, { type: "error", message: "not authenticated" });
      return;
    }

    try {
      if (msg.type === "command") {
        if (!hasScope(scopes, "control.command" as Scope)) {
          send(ws, { type: "error", message: "missing scope: control.command" });
          return;
        }
        await manager.sendCommand(serverId, msg.command);
      } else if (msg.type === "power") {
        const needed: Scope = msg.action === "start" ? "control.start" : "control.stop";
        if (!hasScope(scopes, needed)) {
          send(ws, { type: "error", message: `missing scope: ${needed}` });
          return;
        }
        await manager.power(serverId, msg.action);
      }
    } catch (e: any) {
      send(ws, { type: "error", message: e?.message ?? "command failed" });
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    unsub?.();
  });
  ws.on("error", (e) => logger.debug({ e }, "ws error"));
}
