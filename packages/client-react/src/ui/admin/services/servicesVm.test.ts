import { describe, expect, it } from "vitest";

import type { ServiceNode } from "@rtc/domain";

import { servicesVm } from "./servicesVm";

describe("servicesVm", () => {
  it("returns an empty list for an empty topology", () => {
    expect(servicesVm([])).toEqual([]);
  });

  it("preserves topology order (no re-sorting)", () => {
    const rows = servicesVm([
      node({ name: "kernel" }),
      node({ name: "refdata" }),
      node({ name: "credit" }),
    ]);
    expect(
      rows.map((r) => {
        return r.name;
      }),
    ).toEqual(["kernel", "refdata", "credit"]);
  });

  it("maps status to the prototype's ONLINE/DEGRADED labels", () => {
    const rows = servicesVm([
      node({ name: "pricing", status: "ok" }),
      node({ name: "blotter", status: "degraded", health: 86 }),
    ]);
    expect(rows[0].statusLabel).toBe("ONLINE");
    expect(rows[1].statusLabel).toBe("DEGRADED");
  });

  it("maps a down node to the DOWN label — the real-app extra status the prototype never modelled", () => {
    const rows = servicesVm([
      node({ name: "execution", status: "down", health: 0, throughput: 0 }),
    ]);
    expect(rows[0].statusLabel).toBe("DOWN");
  });

  it("formats latency as '<ms>ms'", () => {
    const rows = servicesVm([node({ latencyMs: 37 })]);
    expect(rows[0].latencyLabel).toBe("37ms");
  });

  it("rounds a fractional latencyMs (live simulator emits unrounded floats) so the label never overflows its fixed-width column", () => {
    const rows = servicesVm([node({ latencyMs: 42.73 })]);
    expect(rows[0].latencyLabel).toBe("43ms");
  });

  describe("health / barPct", () => {
    it("exposes the node's health as a whole percent, and barPct IS the health (not relative throughput)", () => {
      const rows = servicesVm([
        node({ name: "kernel", health: 99, throughput: 200 }),
        node({ name: "refdata", health: 86, throughput: 900 }),
      ]);
      expect(rows[0].health).toBe(99);
      expect(rows[0].barPct).toBe(99);
      // The busier node no longer wins the bar — health does.
      expect(rows[1].health).toBe(86);
      expect(rows[1].barPct).toBe(86);
    });

    it("rounds a fractional health to a whole percent", () => {
      const rows = servicesVm([node({ health: 93.4 })]);
      expect(rows[0].health).toBe(93);
      expect(rows[0].barPct).toBe(93);
    });

    it("clamps rogue health values into [0, 100]", () => {
      const rows = servicesVm([
        node({ name: "kernel", health: 104 }),
        node({ name: "execution", status: "down", health: -3 }),
      ]);
      expect(rows[0].health).toBe(100);
      expect(rows[1].health).toBe(0);
      expect(rows[1].barPct).toBe(0);
    });
  });

  describe("uptimeLabel", () => {
    it("ok -> 99.9x, the digit rising with health across the 95-100 band", () => {
      const rows = servicesVm([
        node({ name: "kernel", health: 100 }),
        node({ name: "pricing", health: 97.5 }),
        node({ name: "credit", health: 95 }),
      ]);
      expect(
        rows.map((r) => {
          return r.uptimeLabel;
        }),
      ).toEqual(["99.99%", "99.95%", "99.90%"]);
    });

    it("degraded -> 9x.x%, formatted from live health (90 + health/10)", () => {
      const rows = servicesVm([
        node({ name: "refdata", status: "degraded", health: 86 }),
        node({ name: "blotter", status: "degraded", health: 93 }),
        node({ name: "credit", status: "degraded", health: 70 }),
      ]);
      expect(
        rows.map((r) => {
          return r.uptimeLabel;
        }),
      ).toEqual(["98.6%", "99.3%", "97.0%"]);
    });

    it("down -> an em dash, no uptime figure", () => {
      const rows = servicesVm([
        node({ name: "execution", status: "down", health: 0, throughput: 0 }),
      ]);
      expect(rows[0].uptimeLabel).toBe("—");
    });

    it("is deterministic across repeat calls for the same input", () => {
      const credit = node({ name: "credit", health: 98, throughput: 42 });
      expect(servicesVm([credit])[0].uptimeLabel).toBe(
        servicesVm([credit])[0].uptimeLabel,
      );
    });
  });
});

function node(overrides: Partial<ServiceNode>): ServiceNode {
  return {
    name: "pricing",
    status: "ok",
    health: 99,
    throughput: 100,
    latencyMs: 5,
    ...overrides,
  };
}
