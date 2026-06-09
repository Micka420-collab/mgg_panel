function Code({ children }: { children: string }) {
  return (
    <pre className="console-surface my-4 overflow-x-auto rounded-xl p-4 font-mono text-[12.5px] leading-relaxed text-console-text">
      {children}
    </pre>
  );
}
function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  const color = method === "GET" ? "text-online" : "text-cyan-light";
  return (
    <div className="flex flex-col gap-1 border-b border-white/5 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className={`w-14 shrink-0 font-mono text-xs font-bold ${color}`}>{method}</span>
      <code className="font-mono text-sm text-white/85">{path}</code>
      <span className="text-sm text-white/45 sm:ml-auto">{desc}</span>
    </div>
  );
}

export default function LauncherDocs() {
  return (
    <div className="space-y-5 text-white/70">
      <h1 className="font-display text-4xl font-bold text-white">Launcher API</h1>
      <p className="text-lg text-white/55">
        Connect your custom Minecraft launcher to MGG. Authenticate a user with a device code, list the servers
        they can access, fetch live connection info, and launch the game straight into the server.
      </p>
      <p className="text-sm text-white/50">
        Machine-readable spec:{" "}
        <a href="/api/openapi.json" target="_blank" rel="noopener" className="text-cyan-light underline hover:text-cyan">
          /api/openapi.json
        </a>{" "}
        (OpenAPI 3.1) — load it into Swagger UI, Scalar or Postman; &quot;copy as curl&quot; works out of the box.
      </p>

      <h2 className="font-display text-2xl font-semibold text-white">1 · Authenticate (device code)</h2>
      <p>
        The launcher never handles raw credentials. It starts a device-code flow, shows the user a short code, and
        polls until they approve it in the panel.
      </p>
      <Code>{`// Start
POST /api/v1/auth/device/start
→ {
    "device_code": "…",
    "user_code": "AB12-CD34",
    "verification_uri": "https://your-host/link",
    "interval": 5,
    "expires_in": 600
  }

// Show user_code + verification_uri, then poll:
POST /api/v1/auth/device/poll  { "device_code": "…" }
→ 202 { "status": "authorization_pending" }      // keep polling every \`interval\`s
→ 200 {                                           // once approved
    "token_type": "Bearer",
    "access_token": "…",   // use as: Authorization: Bearer <access_token>
    "refresh_token": "…",  // store securely (OS keychain)
    "expires_in": 3600,
    "profile": { "id": "…", "name": "Steve", "uuid": null }
  }

// Later, refresh the short-lived access token:
POST /api/v1/auth/refresh  { "refresh_token": "…" }`}</Code>

      <h2 className="font-display text-2xl font-semibold text-white">2 · List servers & connect</h2>
      <Code>{`GET /api/v1/client
→ { "servers": [{ "id", "name", "game", "state", "address", "owner" }] }

GET /api/v1/client/servers/{id}/connection
→ {
    "address": "play.mgg.host",
    "host": "play.mgg.host",
    "port": 25565,
    "game": "minecraft",
    "state": "running",
    "players": { "online": 3, "max": 40 },
    "version": "1.21.4",
    "motd": "Powered by MGG"
  }`}</Code>

      <h2 className="font-display text-2xl font-semibold text-white">3 · Power & live console</h2>
      <Code>{`POST /api/v1/client/servers/{id}/power    { "signal": "start" }   → 204
POST /api/v1/client/servers/{id}/command  { "command": "say hi" } → 204

// Live console / stats over WebSocket:
GET  /api/v1/client/servers/{id}/websocket
→ { "token": "<jwt>", "socket": "ws://node:8080/api/servers/{id}/ws" }
// connect, then send { "type": "auth", "token": "<jwt>" }`}</Code>

      <h2 className="font-display text-2xl font-semibold text-white">4 · Manage files</h2>
      <Code>{`GET  /api/v1/client/servers/{id}/files?path=/            → { path, entries:[{name,isDir,size,modifiedAt}] }
GET  /api/v1/client/servers/{id}/files/content?path=/server.properties  → { path, content }
PUT  /api/v1/client/servers/{id}/files/content  { "path":"/server.properties", "content":"..." }  → 204
POST /api/v1/client/servers/{id}/files  { "op":"mkdir",  "path":"/mods" }                  → 204
POST /api/v1/client/servers/{id}/files  { "op":"rename", "from":"/a.txt", "to":"/b.txt" }  → 204
DELETE /api/v1/client/servers/{id}/files?path=/crash.txt                                    → 204

// Binary artifacts (mod jars, world.zip, logs) — raw body, no JSON wrapping:
GET  /api/v1/client/servers/{id}/files/download?path=/world/level.dat   → file stream
POST /api/v1/client/servers/{id}/files/upload?path=/mods&name=cool.jar  (raw body) → { ok, name }

// One-shot a modpack / world archive (.zip / .tar.gz), extracted into the volume:
POST /api/v1/client/servers/{id}/files/import?name=pack.zip&clear=1     (raw body) → { files }`}</Code>

      <h2 className="font-display text-2xl font-semibold text-white">5 · Backups</h2>
      <Code>{`GET  /api/v1/client/servers/{id}/backups   → { backups:[{ id, name, sizeBytes, locked, completed, createdAt }] }
POST /api/v1/client/servers/{id}/backups   { "name":"pre-update", "ignore":["dynmap"] }   → 201 { id, sizeBytes }
POST /api/v1/client/servers/{id}/backups/{backupId}/restore   → { ok }   // stops the server, swaps atomically
DELETE /api/v1/client/servers/{id}/backups/{backupId}         → 204`}</Code>

      <h2 className="font-display text-2xl font-semibold text-white">6 · Settings &amp; reinstall</h2>
      <Code>{`PATCH /api/v1/client/servers/{id}
  { "name":"My SMP", "autoStop":true, "idleTimeout":600,
    "variables": { "MOTD":"§bHello", "DIFFICULTY":"hard" } }   → { ok }   // applies on next start, never kills a live server

POST  /api/v1/client/servers/{id}/reinstall   → 202 { ok }   // rebuild the container from spec; the data volume is kept

PATCH /api/v1/client/servers/{id}/allocation  { "port": 25565 }  → { ok, port }   // change the game port (rebuilds)`}</Code>

      <h2 className="font-display text-2xl font-semibold text-white">Endpoint reference</h2>
      <div className="glass mt-3 px-5 py-2">
        <Endpoint method="POST" path="/api/v1/auth/device/start" desc="Begin device-code login" />
        <Endpoint method="POST" path="/api/v1/auth/device/poll" desc="Poll for approval → tokens" />
        <Endpoint method="POST" path="/api/v1/auth/refresh" desc="Refresh access token" />
        <Endpoint method="GET" path="/api/v1/auth/me" desc="Current user profile" />
        <Endpoint method="GET" path="/api/v1/client" desc="List accessible servers" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}" desc="Server detail" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}/connection" desc="ip:port + status for auto-join" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}/resources" desc="Live CPU/RAM/players" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/power" desc="start | stop | restart | kill" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/command" desc="Send a console command" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}/websocket" desc="Mint a live console token" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/wake-link" desc="Create a no-login wake link" />
        <Endpoint method="PATCH" path="/api/v1/client/servers/{id}" desc="Update settings / startup variables" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/reinstall" desc="Rebuild the container (keep data)" />
        <Endpoint method="PATCH" path="/api/v1/client/servers/{id}/allocation" desc="Change the game port" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}/files" desc="List a directory" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/files" desc="mkdir | rename" />
        <Endpoint method="DELETE" path="/api/v1/client/servers/{id}/files" desc="Delete a file / dir" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}/files/content" desc="Read a text file" />
        <Endpoint method="PUT" path="/api/v1/client/servers/{id}/files/content" desc="Write a text file" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}/files/download" desc="Download any file (stream)" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/files/upload" desc="Upload a file (stream)" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/files/import" desc="Extract a .zip / .tar.gz" />
        <Endpoint method="GET" path="/api/v1/client/servers/{id}/backups" desc="List backups" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/backups" desc="Create a backup" />
        <Endpoint method="POST" path="/api/v1/client/servers/{id}/backups/{bid}/restore" desc="Restore a backup" />
        <Endpoint method="DELETE" path="/api/v1/client/servers/{id}/backups/{bid}" desc="Delete a backup" />
      </div>
      <p className="text-sm text-white/45">
        API keys (created in your account) also work as bearer tokens. Keys carry scopes; tokens are capped to those
        scopes. Power needs <code>control.start</code>/<code>control.stop</code>, commands need{" "}
        <code>control.command</code>.
      </p>
    </div>
  );
}
