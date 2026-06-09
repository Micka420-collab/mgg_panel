import { docker } from "./docker.js";
import { manager } from "./server-manager.js";
import { logger } from "./logger.js";

/**
 * Subscribe to the Docker event stream and forward state changes for
 * MGG-managed containers to the server manager. This keeps our state
 * machine correct even when a container dies on its own.
 */
export async function watchDockerEvents(): Promise<void> {
  try {
    const stream = (await docker.getEvents({
      filters: { label: ["mgg.managed=true"], type: ["container"] },
    })) as unknown as NodeJS.ReadableStream;

    let buf = "";
    stream.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          const serverId = ev?.Actor?.Attributes?.["mgg.serverId"];
          const action: string = ev?.Action ?? "";
          if (serverId) manager.onDockerEvent(serverId, action);
        } catch {
          /* partial frame */
        }
      }
    });
    stream.on("error", (e) => logger.warn({ e }, "docker event stream error"));
    stream.on("end", () => {
      logger.warn("docker event stream ended; reconnecting in 3s");
      setTimeout(() => void watchDockerEvents(), 3000);
    });
    logger.info("watching docker events");
  } catch (e) {
    logger.error({ e }, "failed to watch docker events; retrying in 5s");
    setTimeout(() => void watchDockerEvents(), 5000);
  }
}
