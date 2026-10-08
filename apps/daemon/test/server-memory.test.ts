import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: vi.fn(), register: vi.fn(),
  updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../panel/src/lib/auth", () => ({ HttpError: class extends Error {
  constructor(public status: number, message: string) { super(message); }
} }));
vi.mock("../../panel/src/lib/access", () => ({ assertNotSuspended: (c: any) => {
  if (c.server.suspended) throw new Error("suspended");
} }));
vi.mock("../../panel/src/lib/db", () => ({ db: { server: {
  updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUniqueOrThrow
} } }));
vi.mock("../../panel/src/lib/daemon", () => ({ DaemonClient: class {
  status = mocks.status; registerServer = mocks.register;
} }));
vi.mock("../../panel/src/lib/spec", () => ({ buildServerSpec: (s: any) => ({
  serverId: s.id, limits: { memoryMb: s.memoryMb }
}) }));
vi.mock("../../panel/src/lib/audit", () => ({ audit: mocks.audit }));
import { reduceServerMemory } from "../../panel/src/lib/server-memory";

const context = () => ({ isOwner: true, server: { id: "test-server", memoryMb: 6144,
  suspended: false }, node: {}, allocations: [] }) as any;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ state: "offline" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUniqueOrThrow.mockResolvedValue({ id: "test-server", memoryMb: 4096, allocations: [] });
  mocks.register.mockResolvedValue({ accepted: true });
});
describe("owner-controlled RAM reduction", () => {
  it("persists both database RAM and the daemon spec without rebuilding a running world", async () => {
    await expect(reduceServerMemory(context(), 4096, "owner")).resolves.toMatchObject({ memoryMb: 4096 });
    expect(mocks.register).toHaveBeenCalledWith({ serverId: "test-server", limits: { memoryMb: 4096 } }, false);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "test-server", memoryMb: 6144 },
      data: { memoryMb: 4096 } });
  });
  it("denies sub-users even if they can edit startup variables", async () => {
    await expect(reduceServerMemory({ ...context(), isOwner: false }, 4096, "sub-user"))
      .rejects.toThrow(/Only the owner/);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("denies increases and changing a live server before any database write", async () => {
    await expect(reduceServerMemory(context(), 8192, "owner")).rejects.toThrow(/current allocation/);
    mocks.status.mockResolvedValue({ state: "running" });
    await expect(reduceServerMemory(context(), 4096, "owner")).rejects.toThrow(/Stop the server/);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("refuses a stale edit without registering the old spec", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(reduceServerMemory(context(), 4096, "owner")).rejects.toThrow(/reload/);
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("rolls the database allocation back when the node rejects persistence", async () => {
    mocks.register.mockRejectedValueOnce(new Error("node unavailable"));
    await expect(reduceServerMemory(context(), 4096, "owner")).rejects.toThrow(/node unavailable/);
    expect(mocks.updateMany).toHaveBeenLastCalledWith({ where: { id: "test-server", memoryMb: 4096 },
      data: { memoryMb: 6144 } });
  });
  it("does not use cached offline state when the node is unreachable", async () => {
    mocks.status.mockRejectedValueOnce(new Error("node unreachable"));
    await expect(reduceServerMemory(context(), 4096, "owner")).rejects.toThrow(/node unreachable/);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
