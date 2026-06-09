# MGG Edge Proxy — wake-on-join

A tiny Go proxy that fronts a Minecraft server's public port and implements
**sleeping / wake-on-join** (the lazymc pattern):

- **Server up** → transparently proxies TCP to the backend container.
- **Ping while down** → replies with a Server List Ping showing a `§e⏳ Server is
  starting…` MOTD, so the server never looks dead in the multiplayer list.
- **Join while down** → calls the daemon to **start** the server and kicks the
  player with *"Server is starting — rejoin in a few seconds!"*.
- **Empty for `idleSeconds`** → calls the daemon to **stop** the server, freeing
  node resources.

## How it fits in

For a proxied server, the daemon binds the game container on an **internal**
port (e.g. `127.0.0.1:25600`) instead of publishing it publicly. The edge proxy
listens on the **public** port (`:25565`) and forwards to it. The proxy reaches
the daemon's control API with the node Bearer token to read state and send
`start`/`stop`.

```
player ──:25565──▶ edge-proxy ──127.0.0.1:25600──▶ minecraft container
                       │  GET /api/servers/:id        (state, players)
                       └▶ POST /api/servers/:id/power  (start | stop)
```

## Run

```bash
cp config.example.json config.json   # edit daemonToken + routes
go run ./...                          # or: go build -o edge-proxy ./...
# or Docker:
docker build -t mgg/edge-proxy .
docker run --net host -v $PWD/config.json:/config.json mgg/edge-proxy
```

`config.json`:

```json
{
  "daemonUrl": "http://localhost:8080",
  "daemonToken": "<DAEMON_TOKEN>",
  "routes": [
    { "listen": ":25565", "backend": "127.0.0.1:25600", "serverId": "<id>", "idleSeconds": 600 }
  ]
}
```

Env overrides: `DAEMON_URL`, `DAEMON_TOKEN`, `CONFIG`, `MGG_DYNAMIC`.

## DDoS protection (built-in guard)

Every connection passes through a Minecraft-aware guard before reaching a game
server. It is configured via env (defaults shown):

| Var | Default | Purpose |
|-----|---------|---------|
| `DDOS_MAX_CONN_PER_IP` | `8` | Max concurrent connections per source IP |
| `DDOS_CONN_PER_MIN` | `40` | Max new connections per IP per minute |
| `DDOS_PING_PER_MIN` | `60` | Max server-list pings per IP per minute |
| `DDOS_BAN_STRIKES` | `10` | Bad/aborted handshakes before a temp ban |
| `DDOS_BAN_SECONDS` | `600` | Temp-ban duration |
| `DDOS_HANDSHAKE_MS` | `4000` | Drop connections that don't send a valid handshake in time (slow-loris) |
| `DDOS_BLOCKLIST` | — | Comma-separated IPs to always reject |
| `PROXY_PROTOCOL` | `0` | Set `1` if an upstream scrubber sends PROXY protocol v1 (so limits apply to the real client IP) |

What it stops: connection floods, slow-loris / idle-hold, ping (SLP) floods, and
junk-packet floods (malformed handshakes accrue strikes → temporary ban). It is
the application-aware layer that complements the host nftables firewall
(`deploy/firewall.sh`) and the panel's L7 rate limiter.

> Bedrock/UDP games use a different protocol; this proxy targets Minecraft Java
> (TCP SLP). UDP wake-on-join is a future addition.
