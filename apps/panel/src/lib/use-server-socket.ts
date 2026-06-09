"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsoleLine, ServerStats, ServerState, PowerAction, ConsoleServerMessage } from "@mgg/shared";
import { api } from "./client";

const MAX_LINES = 600;

/** A console line with a stable, monotonic id for React keys (the buffer slides). */
export type KeyedLine = ConsoleLine & { _id: number };

export interface ServerSocket {
  connected: boolean;
  state: ServerState | null;
  stats: ServerStats | null;
  lines: KeyedLine[];
  sendCommand: (cmd: string) => void;
  sendPower: (action: PowerAction) => void;
  clear: () => void;
}

/**
 * Connect the browser directly to the node daemon's WebSocket using a
 * short-lived JWT minted by the panel. Streams console + live stats, and
 * silently reconnects with a fresh token when the socket drops.
 */
export function useServerSocket(serverId: string): ServerSocket {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<ServerState | null>(null);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [lines, setLines] = useState<KeyedLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const append = useCallback((incoming: ConsoleLine[]) => {
    setLines((prev) => {
      const stamped = incoming.map((l) => ({ ...l, _id: idRef.current++ }));
      const next = [...prev, ...stamped];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const connect = useCallback(async () => {
    try {
      const { token, socket } = await api<{ token: string; socket: string }>(`/api/servers/${serverId}/ws-token`);
      const ws = new WebSocket(socket);
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = (ev) => {
        let msg: ConsoleServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "auth.ok":
            setConnected(true);
            break;
          case "console":
            append(msg.lines);
            break;
          case "stats":
            setStats(msg.stats);
            if (msg.stats.state) setState(msg.stats.state);
            break;
          case "state":
            setState(msg.state);
            break;
          case "install.output":
            append([{ ts: Date.now(), line: msg.line, stream: "system" }]);
            break;
          case "auth.error":
          case "error":
            append([{ ts: Date.now(), line: `[error] ${msg.message}`, stream: "stderr" }]);
            break;
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closedRef.current) retryRef.current = setTimeout(connect, 2500);
      };
      ws.onerror = () => ws.close();
    } catch {
      if (!closedRef.current) retryRef.current = setTimeout(connect, 4000);
    }
  }, [serverId, append]);

  useEffect(() => {
    closedRef.current = false;
    connect();
    return () => {
      closedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendCommand = useCallback((command: string) => {
    wsRef.current?.send(JSON.stringify({ type: "command", command }));
  }, []);
  const sendPower = useCallback((action: PowerAction) => {
    wsRef.current?.send(JSON.stringify({ type: "power", action }));
  }, []);
  const clear = useCallback(() => setLines([]), []);

  return { connected, state, stats, lines, sendCommand, sendPower, clear };
}
