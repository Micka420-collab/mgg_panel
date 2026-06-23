import { docker } from "./docker.js";
import { logger } from "./logger.js";

/**
 * Restart the panel container — used to apply a pulled update (or recover the
 * panel) without rebuilding the whole stack. The daemon runs in a SEPARATE
 * container, so restarting the panel never kills the daemon doing it. The HTTP
 * route responds before calling this so the panel can flush its reply first.
 */
export async function restartPanel(): Promise<void> {
  const list = await docker.listContainers({
    all: true,
    filters: { label: ["com.docker.compose.project=mgg", "com.docker.compose.service=panel"] },
  });
  const panel = list[0];
  if (!panel) throw new Error("panel container not found on this node");
  await docker.getContainer(panel.Id).restart({ t: 5 });
  logger.warn({ container: panel.Id }, "panel restart requested");
}
