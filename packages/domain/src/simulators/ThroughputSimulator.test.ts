import { describe, it, expect } from "vitest";
import { firstValueFrom } from "rxjs";
import { ThroughputSimulator } from "./ThroughputSimulator.js";

describe("ThroughputSimulator", () => {
  it("returns default throughput of 100", async () => {
    const sim = new ThroughputSimulator();
    expect(await firstValueFrom(sim.getThroughput())).toBe(100);
  });

  it("sets and gets throughput", async () => {
    const sim = new ThroughputSimulator();
    await firstValueFrom(sim.setThroughput(500));
    expect(await firstValueFrom(sim.getThroughput())).toBe(500);
  });

  it("accepts boundary values", async () => {
    const sim = new ThroughputSimulator();
    await firstValueFrom(sim.setThroughput(0));
    expect(await firstValueFrom(sim.getThroughput())).toBe(0);
    await firstValueFrom(sim.setThroughput(1000));
    expect(await firstValueFrom(sim.getThroughput())).toBe(1000);
  });

  it("rejects values out of range (matches server: throws)", () => {
    const sim = new ThroughputSimulator();
    expect(() => sim.setThroughput(-1)).toThrow();
    expect(() => sim.setThroughput(1001)).toThrow();
  });

  it("rejects non-finite values (matches server: throws)", () => {
    const sim = new ThroughputSimulator();
    expect(() => sim.setThroughput(NaN)).toThrow();
    expect(() => sim.setThroughput(Infinity)).toThrow();
  });

  it("setThroughput emits undefined then completes", async () => {
    const sim = new ThroughputSimulator();
    expect(await firstValueFrom(sim.setThroughput(250))).toBeUndefined();
  });
});
