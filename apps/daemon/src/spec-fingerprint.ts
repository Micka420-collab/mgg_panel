import { createHash } from "node:crypto";
import type { ServerBuildSpec } from "@mgg/shared";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
export function specFingerprint(spec: ServerBuildSpec): string {
  return createHash("sha256").update(canonical(spec)).digest("hex");
}
