import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("perturb(serviceDown) sets pricing to down", async () => {
    const sim = new ServiceTopologySimulator(3);
    sim.perturb("serviceDown");
    const p = firstValueFrom(sim.topology$());
    await vi.advanceTimersByTimeAsync(0);
    const topo = await p;
    const pricing = topo.nodes.find((n) => {
      return n.name === "pricing";
    });
    expect(pricing?.status).toBe("down");
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
