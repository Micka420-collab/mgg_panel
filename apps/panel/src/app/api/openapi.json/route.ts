import { env } from "@/lib/env";
import { SCOPES } from "@mgg/shared";

/**
 * Public, unauthenticated OpenAPI 3.1 description of the MGG `/api/v1`
 * surface. Hand-written (not generated) so the prose, examples and security
 * model stay accurate. Consumed by Swagger UI / Scalar / "copy as curl"
 * tooling and by the launcher's codegen.
 *
 * GET /api/openapi.json  →  application/json
 */
export const dynamic = "force-dynamic";

const SCOPE_LIST = Object.entries(SCOPES)
  .map(([k, v]) => `\`${k}\` — ${v}`)
  .join("\n");

/** Reusable error response objects keyed for $ref. */
const ERR = (desc: string) => ({
  description: desc,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

/** A path that requires a single bearer scope, documented in its description. */
function buildDoc() {
  return {
    openapi: "3.1.0",
    info: {
      title: "MGG Client API",
      version: "1.0.0",
      summary: "Programmatic access to MGG game-server hosting.",
      description:
        "The MGG **v1 Client API** lets launchers, automations and integrations manage the " +
        "game servers a user can access. Authenticate with a bearer token — either an API key " +
        "(`aeth_…` / admin `aeths_…`) or a launcher session JWT obtained from the device-code flow.\n\n" +
        "### Authentication\n" +
        "Send `Authorization: Bearer <token>` on every `/api/v1/client/**` request. Tokens carry a " +
        "set of **scopes**; an endpoint requires BOTH that the token carries the scope AND that the " +
        "user holds it on the target server. A wildcard `*` scope grants everything.\n\n" +
        "### Device-code flow (launchers)\n" +
        "1. `POST /api/v1/auth/device/start` → show `user_code` + `verification_uri` to the user.\n" +
        "2. The user opens the panel and approves the code.\n" +
        "3. Poll `POST /api/v1/auth/device/poll` with the `device_code` until you receive tokens.\n" +
        "4. Refresh the short-lived access token with `POST /api/v1/auth/refresh`.\n\n" +
        "### Scopes\n" +
        SCOPE_LIST,
      contact: { name: "MGG", url: `${env.appUrl}/docs/launcher` },
    },
    servers: [{ url: env.appUrl, description: "This MGG panel" }],
    tags: [
      { name: "Auth", description: "Device-code login, token refresh and identity." },
      { name: "Servers", description: "Discover and inspect servers." },
      { name: "Power", description: "Start / stop / restart / kill and live resources." },
      { name: "Console", description: "Send commands and stream the live console." },
      { name: "Files", description: "Browse, edit, upload, download and import files." },
      { name: "Backups", description: "Create, list, restore and delete backups." },
      { name: "Maintenance", description: "Reinstall and change the network port." },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      // ── AUTH ───────────────────────────────────────────────────────────
      "/api/v1/auth/device/start": {
        post: {
          tags: ["Auth"],
          summary: "Begin the device-code flow",
          description:
            "Starts a device authorization. Returns a `device_code` (kept secret by the client), a " +
            "short human `user_code`, and the verification URI to show the user. No authentication required.",
          security: [],
          responses: {
            "200": {
              description: "Device authorization started.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DeviceStart" },
                  example: {
                    device_code: "f3a1…",
                    user_code: "ABCD-1234",
                    verification_uri: `${env.appUrl}/link`,
                    verification_uri_complete: `${env.appUrl}/link?code=ABCD-1234`,
                    interval: 5,
                    expires_in: 600,
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/auth/device/poll": {
        post: {
          tags: ["Auth"],
          summary: "Poll for device-code approval",
          description:
            "Exchange a `device_code` for tokens once the user approves. Returns `202` with " +
            "`{status:\"authorization_pending\"}` until approved, or `400` if the code is invalid/expired.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["device_code"],
                  properties: { device_code: { type: "string" } },
                },
                example: { device_code: "f3a1…" },
              },
            },
          },
          responses: {
            "200": {
              description: "Approved — access & refresh tokens issued.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/TokenPair" } } },
            },
            "202": {
              description: "Still pending user approval.",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { status: { type: "string", const: "authorization_pending" } } },
                },
              },
            },
            "400": ERR("`invalid_grant` or `expired_token`."),
          },
        },
      },
      "/api/v1/auth/device/approve": {
        post: {
          tags: ["Auth"],
          summary: "Approve a device code (panel session)",
          description:
            "Called by a logged-in panel user (browser session cookie) from the `/link` page to approve a " +
            "launcher's `user_code`. Not used by launchers themselves.",
          security: [{ sessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } },
                example: { code: "ABCD-1234" },
              },
            },
          },
          responses: {
            "200": { description: "Approved.", content: { "application/json": { schema: { $ref: "#/components/schemas/Ok" } } } },
            "401": ERR("Not signed in."),
            "404": ERR("Code not found or expired."),
          },
        },
      },
      "/api/v1/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Refresh the access token",
          description: "Exchange a long-lived `refresh_token` for a new 1-hour access token.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["refresh_token"], properties: { refresh_token: { type: "string" } } },
                example: { refresh_token: "eyJ…" },
              },
            },
          },
          responses: {
            "200": {
              description: "New access token.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      token_type: { type: "string", const: "Bearer" },
                      access_token: { type: "string" },
                      expires_in: { type: "integer", example: 3600 },
                      scope: { type: "string", description: "Space-separated scopes." },
                    },
                  },
                },
              },
            },
            "401": ERR("Invalid refresh token or account gone."),
          },
        },
      },
      "/api/v1/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Current identity",
          description:
            "Returns the authenticated user's id, name, server count and linked Minecraft account. " +
            "`email`/`role` are only included for full-access (`*`) tokens.",
          responses: {
            "200": {
              description: "Identity.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Me" } } },
            },
            "401": ERR("Missing or invalid bearer token."),
          },
        },
      },

      // ── SERVERS ────────────────────────────────────────────────────────
      "/api/v1/client": {
        get: {
          tags: ["Servers"],
          summary: "List accessible servers",
          description: "Every server the user owns or is a sub-user of, with live state and join address.\n\n**Scope:** `allocation.read`",
          responses: {
            "200": {
              description: "Server list.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ServerList" } } },
            },
            "401": ERR("Unauthenticated."),
            "403": ERR("Token missing scope `allocation.read`."),
          },
        },
      },
      "/api/v1/client/servers/{id}": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Servers"],
          summary: "Server detail",
          description:
            "Full detail for one server including limits, flags, allocations and (with `startup.read`) " +
            "startup variable values.\n\n**Scope:** `allocation.read` (variables also require `startup.read`)",
          responses: {
            "200": { description: "Server detail.", content: { "application/json": { schema: { $ref: "#/components/schemas/ServerDetail" } } } },
            "403": ERR("Missing scope."),
            "404": ERR("Server not found / no access."),
          },
        },
        patch: {
          tags: ["Servers"],
          summary: "Update server settings",
          description:
            "Update name, description, auto-stop/restart, idle timeout and startup variables. Changes apply " +
            "on the next start and never kill a running server.\n\n**Scopes:** `settings.rename` (name), " +
            "`startup.update` (everything else). Suspended servers are read-only.",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ServerPatch" },
                example: { name: "Survival", autoStop: true, idleTimeout: 600, variables: { VERSION: "1.21.1", MAX_PLAYERS: "20" } },
              },
            },
          },
          responses: {
            "200": { description: "Updated.", content: { "application/json": { schema: { $ref: "#/components/schemas/Ok" } } } },
            "403": ERR("Missing scope or suspended."),
            "422": ERR("Invalid variable value."),
          },
        },
      },
      "/api/v1/client/servers/{id}/connection": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Servers"],
          summary: "Join / connection info",
          description:
            "Everything a launcher needs to auto-join: advertised address (prefers a claimed subdomain/SRV), " +
            "host, port, live state, version, MOTD and (with `players.read`) the player count.\n\n**Scope:** `allocation.read`",
          responses: {
            "200": { description: "Connection info.", content: { "application/json": { schema: { $ref: "#/components/schemas/ConnectionInfo" } } } },
            "403": ERR("Missing scope `allocation.read`."),
          },
        },
      },
      "/api/v1/client/servers/{id}/resources": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Power"],
          summary: "Live resource usage",
          description: "Current state plus CPU/memory/disk/network stats and player list (best-effort; null if the node is offline).\n\n**Scope:** `control.console`",
          responses: {
            "200": { description: "Resources.", content: { "application/json": { schema: { $ref: "#/components/schemas/Resources" } } } },
            "403": ERR("Missing scope `control.console`."),
          },
        },
      },
      "/api/v1/client/servers/{id}/power": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        post: {
          tags: ["Power"],
          summary: "Send a power signal",
          description:
            "Start, stop, restart or kill the server.\n\n**Scopes:** `control.start` for `start`; " +
            "`control.stop` for `stop`/`restart`/`kill`. `start`/`restart` require the server not be suspended.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["signal"],
                  properties: { signal: { type: "string", enum: ["start", "stop", "restart", "kill"] } },
                },
                example: { signal: "restart" },
              },
            },
          },
          responses: {
            "204": { description: "Signal accepted." },
            "403": ERR("Missing scope or suspended."),
          },
        },
      },
      "/api/v1/client/servers/{id}/command": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        post: {
          tags: ["Console"],
          summary: "Send a console command",
          description: "Send a single command (RCON/stdin) to a running server.\n\n**Scope:** `control.command`. Suspended servers reject commands.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["command"],
                  properties: { command: { type: "string", minLength: 1, maxLength: 2000 } },
                },
                example: { command: "say Hello from the API" },
              },
            },
          },
          responses: {
            "204": { description: "Command sent." },
            "403": ERR("Missing scope `control.command` or suspended."),
          },
        },
      },
      "/api/v1/client/servers/{id}/websocket": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Console"],
          summary: "Live console/stats socket token",
          description:
            "Returns a short-lived token and `wss://` socket URL to stream the live console and stats. The " +
            "token is capped to the intersection of the caller's token scopes and their server scopes.\n\n**Scope:** `control.console`",
          responses: {
            "200": {
              description: "Socket token.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { token: { type: "string" }, socket: { type: "string", format: "uri" } },
                  },
                },
              },
            },
            "403": ERR("Missing scope `control.console`."),
          },
        },
      },

      // ── FILES ──────────────────────────────────────────────────────────
      "/api/v1/client/servers/{id}/files": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Files"],
          summary: "List a directory",
          description: "List files/folders at `path` (defaults to `/`).\n\n**Scope:** `file.read`",
          parameters: [{ name: "path", in: "query", schema: { type: "string", default: "/" }, description: "Directory path." }],
          responses: {
            "200": { description: "Directory listing.", content: { "application/json": { schema: { $ref: "#/components/schemas/DirListing" } } } },
            "403": ERR("Missing scope `file.read`."),
          },
        },
        post: {
          tags: ["Files"],
          summary: "Make directory or rename",
          description: "Create a directory (`mkdir`) or rename/move (`rename`).\n\n**Scope:** `file.write`",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "object", required: ["op", "path"], properties: { op: { const: "mkdir" }, path: { type: "string" } } },
                    {
                      type: "object",
                      required: ["op", "from", "to"],
                      properties: { op: { const: "rename" }, from: { type: "string" }, to: { type: "string" } },
                    },
                  ],
                },
                examples: {
                  mkdir: { value: { op: "mkdir", path: "/plugins/new" } },
                  rename: { value: { op: "rename", from: "/old.txt", to: "/new.txt" } },
                },
              },
            },
          },
          responses: { "204": { description: "Done." }, "403": ERR("Missing scope `file.write` or suspended.") },
        },
        delete: {
          tags: ["Files"],
          summary: "Delete a file or directory",
          description: "Delete the file/dir at `path`.\n\n**Scope:** `file.delete`",
          parameters: [{ name: "path", in: "query", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "Deleted." }, "403": ERR("Missing scope `file.delete` or suspended.") },
        },
      },
      "/api/v1/client/servers/{id}/files/content": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Files"],
          summary: "Read a text file",
          description: "Return the contents of a text file at `path`.\n\n**Scope:** `file.read`",
          parameters: [{ name: "path", in: "query", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "File content.", content: { "application/json": { schema: { $ref: "#/components/schemas/FileContent" } } } },
            "403": ERR("Missing scope `file.read`."),
          },
        },
        put: {
          tags: ["Files"],
          summary: "Write a text file",
          description: "Create or overwrite a text file.\n\n**Scope:** `file.write`",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["path", "content"],
                  properties: { path: { type: "string", maxLength: 1024 }, content: { type: "string", maxLength: 6291456 } },
                },
                example: { path: "/server.properties", content: "motd=Hello\\nmax-players=20\\n" },
              },
            },
          },
          responses: { "204": { description: "Written." }, "403": ERR("Missing scope `file.write` or suspended.") },
        },
      },
      "/api/v1/client/servers/{id}/files/download": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Files"],
          summary: "Download a raw file",
          description: "Stream any file (any size/type) as an attachment.\n\n**Scope:** `file.read`",
          parameters: [{ name: "path", in: "query", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Raw file stream.",
              content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
            },
            "403": ERR("Missing scope `file.read`."),
            "502": ERR("Download failed (node)."),
          },
        },
      },
      "/api/v1/client/servers/{id}/files/upload": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        post: {
          tags: ["Files"],
          summary: "Upload a single file",
          description:
            "Stream-upload one file (raw request body) into `path` under file name `name`.\n\n**Scope:** `file.write`",
          parameters: [
            { name: "path", in: "query", schema: { type: "string", default: "/" }, description: "Target directory." },
            { name: "name", in: "query", schema: { type: "string", default: "upload.bin" }, description: "Stored file name." },
          ],
          requestBody: {
            required: true,
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          responses: {
            "200": {
              description: "Uploaded.",
              content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, name: { type: "string" } } } } },
            },
            "400": ERR("No file uploaded."),
            "403": ERR("Missing scope `file.write` or suspended."),
          },
        },
      },
      "/api/v1/client/servers/{id}/files/import": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        post: {
          tags: ["Files"],
          summary: "Import (extract) an archive",
          description:
            "Upload a `.zip`/`.tar.gz` (raw body) and extract it into the server volume — e.g. a modpack or " +
            "world. Set `clear=1` to wipe the volume first.\n\n**Scope:** `file.archive`",
          parameters: [
            { name: "name", in: "query", schema: { type: "string", default: "archive.zip" }, description: "Archive file name (determines format)." },
            { name: "clear", in: "query", schema: { type: "string", enum: ["0", "1"] }, description: "`1` to clear the volume before extracting." },
          ],
          requestBody: {
            required: true,
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          responses: {
            "200": { description: "Extraction result.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            "400": ERR("No archive uploaded."),
            "403": ERR("Missing scope `file.archive` or suspended."),
          },
        },
      },

      // ── BACKUPS ────────────────────────────────────────────────────────
      "/api/v1/client/servers/{id}/backups": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        get: {
          tags: ["Backups"],
          summary: "List backups",
          description: "All backups for the server, newest first.\n\n**Scope:** `backup.read`",
          responses: {
            "200": { description: "Backup list.", content: { "application/json": { schema: { $ref: "#/components/schemas/BackupList" } } } },
            "403": ERR("Missing scope `backup.read`."),
          },
        },
        post: {
          tags: ["Backups"],
          summary: "Create a backup",
          description:
            "Create a backup, optionally named and with `ignore` globs to exclude caches/dynmap. Retention " +
            "is enforced before creating.\n\n**Scope:** `backup.create`",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", maxLength: 80 },
                    ignore: { type: "array", items: { type: "string" } },
                  },
                },
                example: { name: "Pre-update", ignore: ["cache/**", "dynmap/**"] },
              },
            },
          },
          responses: {
            "201": {
              description: "Backup created.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      sizeBytes: { type: "integer" },
                      completed: { type: "boolean" },
                    },
                  },
                },
              },
            },
            "403": ERR("Missing scope `backup.create` or suspended."),
          },
        },
      },
      "/api/v1/client/servers/{id}/backups/{backupId}": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }, { $ref: "#/components/parameters/BackupId" }],
        delete: {
          tags: ["Backups"],
          summary: "Delete a backup",
          description: "Delete a backup. Locked backups are protected (`409`).\n\n**Scope:** `backup.delete`",
          responses: {
            "204": { description: "Deleted." },
            "403": ERR("Missing scope `backup.delete`."),
            "404": ERR("Backup not found."),
            "409": ERR("Backup is locked."),
          },
        },
      },
      "/api/v1/client/servers/{id}/backups/{backupId}/restore": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }, { $ref: "#/components/parameters/BackupId" }],
        post: {
          tags: ["Backups"],
          summary: "Restore a backup",
          description: "Stop the server then restore the backup atomically on the node.\n\n**Scope:** `backup.restore`",
          responses: {
            "200": { description: "Restored.", content: { "application/json": { schema: { $ref: "#/components/schemas/Ok" } } } },
            "403": ERR("Missing scope `backup.restore` or suspended."),
            "404": ERR("Backup not found."),
          },
        },
      },

      // ── MAINTENANCE ────────────────────────────────────────────────────
      "/api/v1/client/servers/{id}/reinstall": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        post: {
          tags: ["Maintenance"],
          summary: "Reinstall the server",
          description:
            "Rebuild the container from its spec to recover a corrupt/half-updated server. The data volume " +
            "is preserved.\n\n**Scope:** `settings.reinstall`",
          responses: {
            "202": { description: "Reinstall started.", content: { "application/json": { schema: { $ref: "#/components/schemas/Ok" } } } },
            "403": ERR("Missing scope `settings.reinstall` or suspended."),
          },
        },
      },
      "/api/v1/client/servers/{id}/allocation": {
        parameters: [{ $ref: "#/components/parameters/ServerId" }],
        patch: {
          tags: ["Maintenance"],
          summary: "Change the primary port",
          description: "Change the server's primary (game) port.\n\n**Scope:** `allocation.update`",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["port"],
                  properties: { port: { type: "integer", minimum: 1024, maximum: 65535 } },
                },
                example: { port: 25566 },
              },
            },
          },
          responses: {
            "200": {
              description: "Port changed.",
              content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, port: { type: "integer" } } } } },
            },
            "403": ERR("Missing scope `allocation.update` or suspended."),
          },
        },
      },
    },

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key (aeth_… / aeths_…) or launcher session JWT",
          description:
            "Send `Authorization: Bearer <token>`. The token is either an API key minted in the panel " +
            "(`aeth_<pub>_<secret>`, or admin `aeths_…`) or a session JWT from the device-code flow.",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "session",
          description: "Browser panel session (used only by `/auth/device/approve`).",
        },
      },
      parameters: {
        ServerId: {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Server id.",
        },
        BackupId: {
          name: "backupId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Backup id.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Human-readable message." },
            issues: { type: "object", additionalProperties: true, description: "Zod field issues (validation errors only)." },
          },
          required: ["error"],
        },
        Ok: { type: "object", properties: { ok: { type: "boolean", const: true } } },
        DeviceStart: {
          type: "object",
          properties: {
            device_code: { type: "string" },
            user_code: { type: "string" },
            verification_uri: { type: "string", format: "uri" },
            verification_uri_complete: { type: "string", format: "uri" },
            interval: { type: "integer", description: "Min seconds between polls." },
            expires_in: { type: "integer" },
          },
        },
        TokenPair: {
          type: "object",
          properties: {
            token_type: { type: "string", const: "Bearer" },
            access_token: { type: "string" },
            refresh_token: { type: "string" },
            expires_in: { type: "integer", example: 3600 },
            scope: { type: "string", description: "Space-separated scopes." },
            profile: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                uuid: { type: ["string", "null"], description: "Minecraft UUID." },
                mc_name: { type: ["string", "null"] },
              },
            },
          },
        },
        Me: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            servers_count: { type: "integer" },
            minecraft: {
              type: ["object", "null"],
              properties: { uuid: { type: ["string", "null"] }, name: { type: ["string", "null"] } },
            },
            email: { type: "string", description: "Only for `*` tokens." },
            role: { type: "string", description: "Only for `*` tokens." },
          },
        },
        ServerSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            game: { type: "string" },
            node: { type: "string" },
            state: { type: "string", description: "running | starting | stopping | offline | installing | suspended …" },
            address: { type: ["string", "null"], description: "Join address host:port." },
            owner: { type: "boolean" },
          },
        },
        ServerList: {
          type: "object",
          properties: { servers: { type: "array", items: { $ref: "#/components/schemas/ServerSummary" } } },
        },
        Allocation: {
          type: "object",
          properties: {
            ip: { type: "string" },
            port: { type: "integer" },
            protocol: { type: "string" },
            role: { type: ["string", "null"] },
            primary: { type: "boolean" },
          },
        },
        ServerDetail: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            game: { type: "string" },
            template: { type: "string" },
            state: { type: "string" },
            memoryMb: { type: "integer" },
            cpuPercent: { type: "integer" },
            diskMb: { type: "integer" },
            autoStop: { type: "boolean" },
            autoRestart: { type: "boolean" },
            idleTimeout: { type: "integer" },
            address: { type: ["string", "null"] },
            allocations: { type: "array", items: { $ref: "#/components/schemas/Allocation" } },
            variables: {
              type: "array",
              description: "Only present with `startup.read`.",
              items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } } },
            },
          },
        },
        ServerPatch: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 60 },
            description: { type: "string", maxLength: 300 },
            variables: { type: "object", additionalProperties: { type: "string" }, description: "Startup variable overrides (key→value)." },
            autoStop: { type: "boolean" },
            autoRestart: { type: "boolean" },
            idleTimeout: { type: "integer", minimum: 60, maximum: 86400 },
          },
        },
        ConnectionInfo: {
          type: "object",
          properties: {
            address: { type: "string" },
            host: { type: "string" },
            port: { type: "integer" },
            srv: { type: ["string", "null"] },
            game: { type: "string" },
            state: { type: "string" },
            players: {
              type: ["object", "null"],
              description: "Only with `players.read`.",
              properties: { online: { type: "integer" }, max: { type: "integer" } },
            },
            version: { type: ["string", "null"] },
            motd: { type: ["string", "null"] },
          },
        },
        Resources: {
          type: "object",
          properties: {
            state: { type: "string" },
            resources: {
              type: ["object", "null"],
              description: "CPU/memory/disk/network stats; null if the node is offline.",
              additionalProperties: true,
            },
            players: { type: ["object", "null"], additionalProperties: true },
          },
        },
        DirEntry: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["file", "directory"] },
            size: { type: "integer" },
            modifiedAt: { type: "string", format: "date-time" },
          },
        },
        DirListing: {
          type: "object",
          description: "Directory listing as returned by the node daemon.",
          properties: { path: { type: "string" }, entries: { type: "array", items: { $ref: "#/components/schemas/DirEntry" } } },
          additionalProperties: true,
        },
        FileContent: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          additionalProperties: true,
        },
        Backup: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            sizeBytes: { type: "integer" },
            checksum: { type: ["string", "null"] },
            locked: { type: "boolean" },
            completed: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        BackupList: {
          type: "object",
          properties: { backups: { type: "array", items: { $ref: "#/components/schemas/Backup" } } },
        },
      },
    },
  };
}

export function GET() {
  return new Response(JSON.stringify(buildDoc(), null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
