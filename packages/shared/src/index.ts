/**
 * @mgg/shared — the cross-runtime contract for the MGG platform.
 * Imported by the Next.js panel (browser + server) and the Node daemon.
 */
export * from "./types.js";
export * from "./scopes.js";
export * from "./util.js";
export * from "./templates/index.js";

export const MGG = {
  name: "MGG",
  tagline: "Game servers, summoned in seconds.",
  version: "1.0.0",
} as const;
