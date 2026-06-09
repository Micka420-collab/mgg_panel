import { docker, pullImage } from "./docker.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Self-update — pull the latest code from GitHub and rebuild + restart the panel
 * and daemon. Because rebuilding recreates THIS daemon, the work runs in a
 * detached, standalone `docker:cli` "updater" container (not part of the compose
 * project, so it survives the restart). The repo path on the host is auto-detected
 * from the compose project's working-dir label and bind-mounted into the updater.
 */
export async function selfUpdate(): Promise<void> {
  const list = await docker.listContainers({ all: true, filters: { label: ["com.docker.compose.project=mgg"] } });
  const repo = list.map((c) => c.Labels?.["com.docker.compose.project.working_dir"]).find(Boolean);
  if (!repo) throw new Error("could not locate the MGG repository on the host");

  const script = [
    "set -e",
    "apk add --no-cache git docker-cli-compose >/dev/null 2>&1 || true",
    "git config --global --add safe.directory '*' || true",
    `cd ${JSON.stringify(repo)}`,
    "sleep 2", // let the HTTP response flush first
    "git fetch origin",
    "git pull --ff-only",
    "docker compose build panel daemon",
    "docker compose up -d panel daemon",
  ].join("; ");

  // Ensure the updater image is available (usually already pulled).
  await pullImage("docker:cli").catch(() => {});

  const container = await docker.createContainer({
    Image: "docker:cli",
    name: `${config.prefix}-self-update`,
    Cmd: ["sh", "-c", script],
    HostConfig: {
      AutoRemove: true,
      Binds: [`${config.dockerSocket}:/var/run/docker.sock`, `${repo}:${repo}`],
    },
  });
  await container.start();
  logger.warn({ repo, container: container.id }, "self-update started — pulling from GitHub and rebuilding");
}
