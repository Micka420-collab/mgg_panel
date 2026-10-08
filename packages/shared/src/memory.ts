/** Operational errors that may safely cross from the daemon to the panel. */
export interface MemoryAdmission {
  availableMb: number;
  requiredMb: number;
  reserveMb: number;
}
export function assessMemoryAdmission(input: MemoryAdmission): boolean {
  const { availableMb, requiredMb, reserveMb } = input;
  if (![availableMb, requiredMb, reserveMb].every(n => Number.isSafeInteger(n) && n >= 0) || requiredMb === 0) {
    throw new Error("Invalid memory admission configuration");
  }
  return requiredMb <= Math.max(0, availableMb - reserveMb);
}
export function memoryAdmissionMessage(input: MemoryAdmission): string {
  return `Not enough free RAM to start: ${input.availableMb} MB available, ${input.requiredMb} MB required, ` +
    `${input.reserveMb} MB reserved for the host. Reduce the server RAM in Settings or stop another server.`;
}
export class MemoryAdmissionError extends Error {
  readonly code = "INSUFFICIENT_MEMORY";
  constructor(readonly details: MemoryAdmission) {
    super(memoryAdmissionMessage(details));
  }
}
/** Only this structured, validated error is public; arbitrary daemon errors stay private. */
export function publicDaemonError(body: unknown): { status: number; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  if (data.code !== "INSUFFICIENT_MEMORY" || !data.details || typeof data.details !== "object") return null;
  const details = data.details as MemoryAdmission;
  try {
    if (assessMemoryAdmission(details)) return null;
    return { status: 409, message: memoryAdmissionMessage(details) };
  } catch { return null; }
}
/** Owners may reduce a stopped server's limit, without granting a paid resource increase. */
export function memoryReductionError(currentMb: number, requestedMb: number, state: string): string | null {
  if (!Number.isSafeInteger(requestedMb) || requestedMb < 512 || requestedMb > currentMb) {
    return "RAM must be a whole number between 512 MB and the current allocation.";
  }
  if (!["offline", "errored"].includes(state)) return "Stop the server before changing its RAM limit.";
  return null;
}
