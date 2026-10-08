import { describe, it, expect } from "vitest";
import { assessMemoryAdmission, MemoryAdmissionError, publicDaemonError, memoryReductionError } from "../dist/index.js";

describe("memory admission and panel error contract", () => {
  const observed = { availableMb: 5978, requiredMb: 6144, reserveMb: 512 };
  it("reproduces the Ubuntu failure and permits a 4 GB test limit with host reserve", () => {
    expect(assessMemoryAdmission(observed)).toBe(false);
    expect(assessMemoryAdmission({ ...observed, requiredMb: 4096 })).toBe(true);
    const error = new MemoryAdmissionError(observed);
    expect(publicDaemonError({ code: error.code, details: error.details })).toEqual({
      status: 409, message: error.message
    });
    expect(error.message).toMatch(/Reduce the server RAM in Settings/);
  });
  it("refuses invalid budgets and does not expose arbitrary daemon text", () => {
    for (const reserveMb of [NaN, Infinity, -1, 0.5]) {
      expect(() => assessMemoryAdmission({ ...observed, reserveMb })).toThrow();
    }
    for (const body of [{ error: "private-token" }, { code: "INSUFFICIENT_MEMORY", details: {} },
      { code: "INSUFFICIENT_MEMORY", details: { ...observed, requiredMb: 4096 }, error: "private-token" }]) {
      expect(publicDaemonError(body)).toBeNull();
    }
    expect(publicDaemonError({ code: "INSUFFICIENT_MEMORY", details: observed, error: "private-token" })?.message)
      .not.toContain("private-token");
  });
  it("allows only bounded reductions on stopped servers", () => {
    expect(memoryReductionError(6144, 4096, "offline")).toBeNull();
    for (const value of [NaN, 511, 4096.5, 8192]) expect(memoryReductionError(6144, value, "offline")).not.toBeNull();
    for (const state of ["running", "starting", "stopping", "installing", "suspended"]) {
      expect(memoryReductionError(6144, 4096, state)).toMatch(/Stop the server/);
    }
  });
});
