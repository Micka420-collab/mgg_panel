import { beforeEach, describe, it, expect, vi } from "vitest";
import { ServerState, MemoryAdmissionError, type ServerBuildSpec } from "@mgg/shared";
import { specFingerprint } from "../dist/spec-fingerprint.js";

const dockerMock = vi.hoisted(() => ({
  hostAvailableMb: vi.fn(), inspect: vi.fn(), buildContainer: vi.fn(),
  pullImage: vi.fn(), startContainer: vi.fn(), stopContainer: vi.fn(),
  attachStdin: vi.fn(), followLogs: vi.fn(), hostVolumePath: () => "/tmp/test-mgg-volume",
  internalPort: (port: number) => port + 20000, killContainer: vi.fn(),
  mapState: (info: any) => info.State.Running ? "running" : "offline",
  rconHost: vi.fn(), removeContainer: vi.fn(), streamStats: vi.fn()
}));
vi.mock("../dist/docker.js", () => dockerMock);
vi.mock("node:fs/promises", () => ({ default: { mkdir: vi.fn(), writeFile: vi.fn() } }));
import { ServerManager } from "../dist/server-manager.js";

const spec = (): ServerBuildSpec => ({
  serverId: "test-server", templateId: "minecraft-java", dockerImage: "test-image",
  startupCommand: "", stopSignal: "SIGTERM", stopCommand: "stop", startupDoneRegex: "Done",
  containerDataPath: "/data", environment: { VERSION: "1.21.11" }, allocations: [],
  limits: { memoryMb: 6144, swapMb: 0, cpuPercent: 200, diskMb: 10240, pids: 512, oomDisabled: false },
  features: []
});
function stopped(s = spec()) {
  return { State: { Running: false }, Config: { Image: s.dockerImage,
    Labels: { "mgg.specHash": specFingerprint(s) } } };
}
async function setup(s = spec()) {
  const manager = new ServerManager();
  vi.spyOn(manager as any, "beginStreaming").mockImplementation(() => {});
  await manager.register(s, false);
  return manager;
}
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NODE_MEMORY_RESERVE_MB;
  dockerMock.hostAvailableMb.mockResolvedValue(5978);
  dockerMock.inspect.mockResolvedValue(stopped());
  dockerMock.buildContainer.mockResolvedValue(undefined);
  dockerMock.startContainer.mockResolvedValue(undefined);
  dockerMock.pullImage.mockResolvedValue(undefined);
});
describe("safe start and saved configuration", () => {
  it("returns the actual RAM refusal without building or starting anything", async () => {
    const manager = await setup();
    await expect(manager.power("test-server", "start")).rejects.toBeInstanceOf(MemoryAdmissionError);
    expect(dockerMock.buildContainer).not.toHaveBeenCalled();
    expect(dockerMock.startContainer).not.toHaveBeenCalled();
    expect(manager.getSnapshot("test-server")?.state).toBe(ServerState.Offline);
  });
  it("applies a lower RAM spec on the next start while preserving the world mount", async () => {
    const manager = await setup();
    const lower = spec(); lower.limits.memoryMb = 4096;
    await manager.register(lower, false);
    expect(dockerMock.buildContainer).not.toHaveBeenCalled();
    await manager.power("test-server", "start");
    expect(dockerMock.buildContainer).toHaveBeenCalledWith(lower);
    expect(dockerMock.startContainer).toHaveBeenCalledOnce();
    expect(dockerMock.pullImage).not.toHaveBeenCalled();
    expect(dockerMock.removeContainer).not.toHaveBeenCalled();
  });
  it("a matching stopped container starts without an unnecessary rebuild", async () => {
    dockerMock.hostAvailableMb.mockResolvedValue(8192);
    const manager = await setup();
    await manager.power("test-server", "start");
    expect(dockerMock.buildContainer).not.toHaveBeenCalled();
    expect(dockerMock.startContainer).toHaveBeenCalledOnce();
  });
  it("serializes two simultaneous Start requests", async () => {
    dockerMock.hostAvailableMb.mockResolvedValue(8192);
    const manager = await setup();
    await Promise.all([manager.power("test-server", "start"), manager.power("test-server", "start")]);
    expect(dockerMock.startContainer).toHaveBeenCalledOnce();
  });
  it("restart rechecks RAM instead of bypassing admission", async () => {
    const manager = await setup();
    await expect(manager.power("test-server", "restart")).rejects.toBeInstanceOf(MemoryAdmissionError);
    expect(dockerMock.startContainer).not.toHaveBeenCalled();
  });
  it("a failed Docker start returns to offline and does not poison the next request", async () => {
    dockerMock.hostAvailableMb.mockResolvedValue(8192);
    dockerMock.startContainer.mockRejectedValueOnce(new Error("port already in use"));
    const manager = await setup();
    await expect(manager.power("test-server", "start")).rejects.toThrow(/port already/);
    expect(manager.getSnapshot("test-server")?.state).toBe(ServerState.Offline);
    await manager.power("test-server", "start");
    expect(dockerMock.startContainer).toHaveBeenCalledTimes(2);
  });
  it("never recreates an actually running container with stale cached state", async () => {
    dockerMock.hostAvailableMb.mockResolvedValue(8192);
    dockerMock.inspect.mockResolvedValue({ State: { Running: true }, Config: { Labels: {} } });
    const manager = await setup();
    await manager.power("test-server", "start");
    expect(dockerMock.buildContainer).not.toHaveBeenCalled();
    expect(dockerMock.startContainer).not.toHaveBeenCalled();
  });
  it("fingerprints environment and RAM changes independently of object key order", () => {
    const a = spec();
    const b = { ...a, environment: { ONE: "1", TWO: "2" } };
    expect(specFingerprint(b)).toBe(specFingerprint({ ...a, environment: { TWO: "2", ONE: "1" } }));
    expect(specFingerprint(a)).not.toBe(specFingerprint(b));
    expect(specFingerprint(a)).not.toBe(specFingerprint({ ...a, limits: { ...a.limits, memoryMb: 4096 } }));
  });
});
