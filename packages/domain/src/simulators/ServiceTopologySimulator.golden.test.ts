import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTopology } from "../telemetry/topology.js";
import { ServiceTopologySimulator } from "./ServiceTopologySimulator.js";

beforeEach(() => {
  return vi.useFakeTimers();
});
afterEach(() => {
  return vi.useRealTimers();
});

describe("ServiceTopologySimulator golden", () => {
  it("emits exactly 7 nodes in deterministic order", async () => {
    const sim = new ServiceTopologySimulator(3);
    const p = firstValueFrom(sim.topology$());
    await vi.advanceTimersByTimeAsync(0);
    const topo = await p;
    expect(
      topo.nodes.map((n) => {
        return n.name;
      }),
    ).toEqual([
      "pricing",
      "execution",
      "blotter",
      "analytics",
      "credit",
      "refdata",
      "kernel",
    ]);
  });

  it("emits per-service health walks: calm ~99 fleet, refdata low+choppy, blotter mid (golden)", async () => {
    const sim = new ServiceTopologySimulator(3);
    const collected: ServiceTopology[] = [];
    const sub = sim.topology$().subscribe((t) => {
      collected.push(t);
    });
    await vi.advanceTimersByTimeAsync(20_000);
    sub.unsubscribe();

    const last = collected[collected.length - 1];
    const byName = new Map(
      last.nodes.map((n) => {
        return [n.name, n] as const;
      }),
    );

    // Calm high services stay in the ok band…
    expect(byName.get("pricing")?.health).toBeGreaterThanOrEqual(97);
    expect(byName.get("kernel")?.health).toBeGreaterThanOrEqual(98);
    expect(byName.get("pricing")?.status).toBe("ok");
    // …refdata walks a visibly lower, choppier band (76-94 → degraded)…
    const refdata = byName.get("refdata");
    expect(refdata?.health).toBeGreaterThanOrEqual(76);
    expect(refdata?.health).toBeLessThanOrEqual(94);
    expect(refdata?.status).toBe("degraded");
    // …and blotter sits mid (88-98), straddling the ok/degraded threshold.
    expect(byName.get("blotter")?.health).toBeGreaterThanOrEqual(88);
    expect(byName.get("blotter")?.health).toBeLessThanOrEqual(98);

    // The walk moves: refdata's health is not a constant across ticks.
    const refdataSeries = collected.map((t) => {
      return t.nodes.find((n) => {
        return n.name === "refdata";
      })?.health;
    });
    expect(new Set(refdataSeries).size).toBeGreaterThan(1);
  });

  it("perturb(serviceDown) sets pricing to down with health 0", async () => {
    const sim = new ServiceTopologySimulator(3);
    sim.perturb("serviceDown");
    const p = firstValueFrom(sim.topology$());
    await vi.advanceTimersByTimeAsync(0);
    const topo = await p;
    const pricing = topo.nodes.find((n) => {
      return n.name === "pricing";
    });
    expect(pricing?.status).toBe("down");
    expect(pricing?.health).toBe(0);
  });

  it("perturb(serviceDown) raises pricing edge latencyMs to 800, distinct from baseline (golden)", async () => {
    // Capture baseline edge latencyMs for pricing (seed 3: ~4.07, range 0.5-5)
    const simBase = new ServiceTopologySimulator(3);
    const pBase = firstValueFrom(simBase.topology$());
    await vi.advanceTimersByTimeAsync(0);
    const topoBase = await pBase;
    const baselineEdge = topoBase.edges.find((e) => {
      return e.to === "pricing";
    });
    const baselineLatency = baselineEdge?.latencyMs ?? 0;
    expect(baselineLatency).toBeGreaterThan(0.5);
    expect(baselineLatency).toBeLessThan(5); // real observed: ~4.07

    // Perturbed: pricing edge jumps to exactly 800
    const sim = new ServiceTopologySimulator(3);
    sim.perturb("serviceDown");
    const p = firstValueFrom(sim.topology$());
    await vi.advanceTimersByTimeAsync(0);
    const topo = await p;
    const pricingEdge = topo.edges.find((e) => {
      return e.to === "pricing";
    });
    expect(pricingEdge?.latencyMs).toBe(800);
    // Prove distinctness: 800 is ~196× the baseline (~4.07); gap > 795
    expect(pricingEdge?.latencyMs).not.toBe(baselineLatency);
  });
});
