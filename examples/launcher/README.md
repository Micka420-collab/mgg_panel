# MGG — reference launcher client

A minimal, zero-dependency Node script showing exactly how a **custom Minecraft
launcher** integrates with the MGG API: authenticate the user, list their
servers, fetch live connection info, optionally wake a sleeping server, and
auto-join.

## Run

```bash
cd examples/launcher

# Device-code login (opens a code you approve at <panel>/link):
MGG_URL=http://localhost:3000 node index.mjs

# …or authenticate with an API key created in your account, and auto-start:
MGG_URL=http://localhost:3000 MGG_TOKEN=aeth_xxx node index.mjs --start
```

## What it demonstrates

| Step | Endpoint |
|------|----------|
| Start device login | `POST /api/v1/auth/device/start` |
| Poll for tokens | `POST /api/v1/auth/device/poll` |
| Who am I | `GET /api/v1/auth/me` |
| List servers | `GET /api/v1/client` |
| Connection info | `GET /api/v1/client/servers/{id}/connection` |
| Start server | `POST /api/v1/client/servers/{id}/power` |

The `connection` response returns `{ host, port, state, players, version, motd }`
— everything your launcher hands to the game to auto-join:

```
minecraft --server <host> --port <port>
```

## Porting to your launcher

The flow is the same in any language/runtime (Electron, C#, Rust, …):
1. Run the device-code flow once and store the `refresh_token` securely
   (OS keychain). Use `POST /api/v1/auth/refresh` to get fresh access tokens.
2. Send `Authorization: Bearer <access_token>` on every call.
3. Before launching, GET `/connection`; if `state !== "running"`, POST `power`
   with `{ "signal": "start" }` and poll `/connection` until it's running.
