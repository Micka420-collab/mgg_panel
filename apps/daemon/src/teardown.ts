import path from "node:path";
import { docker, pullImage } from "./docker.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Self-destruct — wipe the ENTIRE MGG installation from this VM: the whole
 * docker-compose stack (panel, daemon, postgres, caddy, edge-proxy), every
 * managed game container, all their named volumes (incl. the Postgres data),
 * and everything under the host data dir. IRREVERSIBLE.
 *
 * Removing the stack also kills THIS daemon, so the teardown runs inside a
 * detached, standalone "destroyer" container (`docker:cli`) that is NOT part of
 * the compose project — it therefore survives long enough to finish the job and
 * then auto-removes itself. The caller should respond to the client BEFORE the
 * short delay elapses.
 */
export async function selfDestruct(): Promise<void> {
  const hostDataRoot = path.dirname(config.dataDir); // bind paths match host:container, e.g. /var/lib/mgg
  const project = "mgg"; // docker-compose project name (docker-compose.yml `name:`)
  const prefix = config.prefix; // managed game-container name prefix

  const script = [
    "set -e",
    "sleep 6", // let the HTTP response flush + the dashboard show its goodbye screen
    // 1) the whole compose stack (panel, daemon, postgres, caddy, edge-proxy)
    `docker ps -aq --filter "label=com.docker.compose.project=${project}" | xargs -r docker rm -f || true`,
    // 2) every managed game container (prefix_<serverId>)
    `docker ps -aq --filter "name=${prefix}_" | xargs -r docker rm -f || true`,
    // 3) the project's named volumes (includes the Postgres data volume)
    `docker volume ls -q --filter "label=com.docker.compose.project=${project}" | xargs -r docker volume rm -f || true`,
    // 4) wipe all data on disk (server volumes, backups, host key)
    "rm -rf /hostdata/* /hostdata/.[!.]* 2>/dev/null || true",
  ].join("; ");

  // Ensure the destroyer image is available (best-effort; usually already pulled).
  await pullImage("docker:cli").catch(() => {});

  const container = await docker.createContainer({
    Image: "docker:cli",
    name: `${prefix}-self-destruct`,
    Cmd: ["sh", "-c", script],
    HostConfig: {
      AutoRemove: true,
      Binds: [`${config.dockerSocket}:/var/run/docker.sock`, `${hostDataRoot}:/hostdata`],
    },
  });
  await container.start();
  logger.warn({ container: container.id }, "self-destruct armed — the entire MGG stack will be wiped shortly");
}
