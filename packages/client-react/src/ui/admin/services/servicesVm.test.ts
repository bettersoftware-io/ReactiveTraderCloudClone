import { describe, expect, it } from "vitest";

import type { ServiceNode } from "@rtc/domain";

import { servicesVm } from "./servicesVm";

describe("servicesVm", () => {
  it("returns an empty list for an empty topology", () => {
    expect(servicesVm([])).toEqual([]);
  });

  it("preserves topology order (no re-sorting)", () => {
    const nodes: ServiceNode[] = [
      { name: "kernel", status: "ok", throughput: 100, latencyMs: 2 },
      { name: "refdata", status: "ok", throughput: 10, latencyMs: 5 },
      { name: "credit", status: "ok", throughput: 50, latencyMs: 3 },
    ];
    const rows = servicesVm(nodes);
    expect(
      rows.map((r) => {
        return r.name;
      }),
    ).toEqual(["kernel", "refdata", "credit"]);
  });

  it("maps status to the prototype's ONLINE/DEGRADED labels", () => {
    const rows = servicesVm([
      { name: "pricing", status: "ok", throughput: 100, latencyMs: 5 },
      { name: "blotter", status: "degraded", throughput: 50, latencyMs: 20 },
    ]);
    expect(rows[0].statusLabel).toBe("ONLINE");
    expect(rows[1].statusLabel).toBe("DEGRADED");
  });

  it("maps a down node to the DOWN label — the real-app extra status the prototype never modelled", () => {
    const rows = servicesVm([
      { name: "execution", status: "down", throughput: 0, latencyMs: 0 },
    ]);
    expect(rows[0].statusLabel).toBe("DOWN");
  });

  it("formats latency as '<ms>ms'", () => {
    const rows = servicesVm([
      { name: "pricing", status: "ok", throughput: 10, latencyMs: 37 },
    ]);
    expect(rows[0].latencyLabel).toBe("37ms");
  });

  it("rounds a fractional latencyMs (live simulator emits unrounded floats) so the label never overflows its fixed-width column", () => {
    const rows = servicesVm([
      { name: "pricing", status: "ok", throughput: 10, latencyMs: 42.73 },
    ]);
    expect(rows[0].latencyLabel).toBe("43ms");
  });

  describe("barPct", () => {
    it("gives the busiest node 100%", () => {
      const rows = servicesVm([
        { name: "kernel", status: "ok", throughput: 200, latencyMs: 2 },
        { name: "pricing", status: "ok", throughput: 100, latencyMs: 5 },
      ]);
      expect(rows[0].barPct).toBe(100);
      expect(rows[1].barPct).toBe(50);
    });

    it("gives an idle node 0%", () => {
      const rows = servicesVm([
        { name: "kernel", status: "ok", throughput: 200, latencyMs: 2 },
        { name: "execution", status: "down", throughput: 0, latencyMs: 0 },
      ]);
      expect(rows[1].barPct).toBe(0);
    });

    it("stays 0 (not NaN) when every node is idle", () => {
      const rows = servicesVm([
        { name: "kernel", status: "down", throughput: 0, latencyMs: 0 },
        { name: "pricing", status: "down", throughput: 0, latencyMs: 0 },
      ]);
      expect(rows[0].barPct).toBe(0);
      expect(rows[1].barPct).toBe(0);
    });

    it("rounds to a whole percent", () => {
      const rows = servicesVm([
        { name: "kernel", status: "ok", throughput: 3, latencyMs: 2 },
        { name: "pricing", status: "ok", throughput: 1, latencyMs: 5 },
      ]);
      // 1/3 * 100 = 33.33... -> rounds to 33
      expect(rows[1].barPct).toBe(33);
    });
  });

  describe("uptimeLabel", () => {
    // Pinned per-name digits (deterministic hash of the char codes) — a
    // regression here means the hash function changed, which is a visible
    // product change (every service's displayed uptime shifts), not a refactor.
    it("ok -> 99.9x, a stable per-name digit", () => {
      const rows = servicesVm([
        { name: "kernel", status: "ok", throughput: 10, latencyMs: 1 },
        { name: "pricing", status: "ok", throughput: 10, latencyMs: 1 },
        { name: "execution", status: "ok", throughput: 10, latencyMs: 1 },
        { name: "blotter", status: "ok", throughput: 10, latencyMs: 1 },
        { name: "analytics", status: "ok", throughput: 10, latencyMs: 1 },
        { name: "credit", status: "ok", throughput: 10, latencyMs: 1 },
        { name: "refdata", status: "ok", throughput: 10, latencyMs: 1 },
      ]);
      expect(
        rows.map((r) => {
          return r.uptimeLabel;
        }),
      ).toEqual([
        "99.91%",
        "99.98%",
        "99.90%",
        "99.94%",
        "99.98%",
        "99.95%",
        "99.97%",
      ]);
    });

    it("degraded -> 98.x, the same per-name digit as the ok case", () => {
      const rows = servicesVm([
        { name: "kernel", status: "degraded", throughput: 10, latencyMs: 20 },
        {
          name: "pricing",
          status: "degraded",
          throughput: 10,
          latencyMs: 20,
        },
      ]);
      expect(
        rows.map((r) => {
          return r.uptimeLabel;
        }),
      ).toEqual(["98.1%", "98.8%"]);
    });

    it("down -> an em dash, no uptime figure", () => {
      const rows = servicesVm([
        { name: "execution", status: "down", throughput: 0, latencyMs: 0 },
      ]);
      expect(rows[0].uptimeLabel).toBe("—");
    });

    it("is deterministic across repeat calls for the same input", () => {
      const node: ServiceNode = {
        name: "credit",
        status: "ok",
        throughput: 42,
        latencyMs: 8,
      };
      expect(servicesVm([node])[0].uptimeLabel).toBe(
        servicesVm([node])[0].uptimeLabel,
      );
    });
  });
});
