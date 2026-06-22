import { describe, expect, it } from "vitest";

import { ThroughputService } from "../ThroughputService.js";

describe("ThroughputService", () => {
  it("returns default throughput of 100", () => {
    const svc = new ThroughputService();
    expect(svc.getThroughput()).toBe(100);
  });

  it("sets and gets throughput", () => {
    const svc = new ThroughputService();
    svc.setThroughput(500);
    expect(svc.getThroughput()).toBe(500);
  });

  it("accepts boundary values", () => {
    const svc = new ThroughputService();
    svc.setThroughput(0);
    expect(svc.getThroughput()).toBe(0);
    svc.setThroughput(1000);
    expect(svc.getThroughput()).toBe(1000);
  });

  it("rejects values out of range", () => {
    const svc = new ThroughputService();
    expect(() => svc.setThroughput(-1)).toThrow();
    expect(() => svc.setThroughput(1001)).toThrow();
  });

  it("rejects non-finite values", () => {
    const svc = new ThroughputService();
    expect(() => svc.setThroughput(NaN)).toThrow();
    expect(() => svc.setThroughput(Infinity)).toThrow();
  });
});
