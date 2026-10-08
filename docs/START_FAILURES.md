# Minecraft start refusal on a small Ubuntu node

Observed 2026-10-08 on the installed `1c0e253` build: the test server had a
6144 MB container limit. Ubuntu reported 5978 MB available and MGG reserved
512 MB for the host. Its refusal to allocate 6144 MB was expected. The REST
panel incorrectly turned the operational message into HTTP 500 “Internal error”.
The authenticated console showed the true RAM refusal.

The fix returns a validated HTTP 409 message with the available/required RAM
and suggests reducing RAM in Settings. Arbitrary daemon error text remains
private. Owners/admins with `startup.update` can reduce a stopped server's
RAM from Settings → Server RAM, or use:

```http
PATCH /api/v1/client/servers/SERVER_ID/memory
Authorization: Bearer YOUR_LOCAL_KEY
Content-Type: application/json

{"memoryMb":4096}
```

This changes the actual allocation and hourly credit charge. It only permits
reductions; increasing/restoring a higher allocation requires administrator
provisioning. The node must confirm the server is stopped. Sub-users and
suspended servers cannot change allocation. Concurrent stale changes fail.

Saving a spec does not stop a server. At its next start, the daemon compares a
configuration fingerprint and recreates a **stopped** container if necessary,
using its original bind-mounted volume. The world is preserved. This also
fixes previously ignored startup-variable changes. Duplicate starts serialize;
restart obeys the same memory admission check; failed Docker starts return to
offline instead of remaining stuck in starting. Containers from older versions
have no fingerprint and are recreated once at their next successful start.

The memory check retains the host reserve. Set a lower Minecraft JVM `MEMORY`
value too if you previously set an explicit heap larger than the new container
limit. A blank JVM memory setting keeps the game image's default.

## Apply a reviewed local patch

The Ubuntu account may read `/opt/mgg` while lacking permission to write it or
access the Docker socket. Prepare and test changes in a separate writable
checkout. From that checkout, generate a patch from the installed base,
including newly tracked files. An administrator can then run:

```bash
sudo bash /home/mc/mgg_panel/deploy/apply-local-fix.sh /home/mc/.config/mcgenesis/mgg-start-fix.patch
```

The installer checks for local source changes, validates the patch, stores a
root-only rollback copy in `/var/backups/mgg-local-fix.*`, builds, and recreates
only panel/daemon. It does not change credentials, database schema, worlds,
ports or server resource limits. A failed build leaves existing containers
running. After installation, lower the stopped test server to 4096 MB in
Settings and start it. Do not compensate by disabling the reserve.

Rollback: in `/opt/mgg`, apply `git apply -R` to the installer’s saved
`source.patch`, then rebuild and recreate panel/daemon. A reduced RAM
allocation remains in the database and spec until deliberately reprovisioned.
No data migration is introduced.

## Evidence

`npm test` covers the real observed RAM numbers, validated public errors,
owner-only reductions, database/spec persistence and failure rollback,
stale edits, stopped-container rebuilds, duplicate starts, restart admission
and Docker failure recovery. These use mocks, not a running Docker engine.
`npm run typecheck` and the production panel build check the routes and UI.
Actual game startup must be checked after administrator installation.
