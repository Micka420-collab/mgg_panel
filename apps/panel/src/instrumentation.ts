/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * We start the in-process cron scheduler here (Node runtime only) so scheduled
 * tasks fire automatically in a self-hosted deployment.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MGG_DISABLE_SCHEDULER !== "1") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
