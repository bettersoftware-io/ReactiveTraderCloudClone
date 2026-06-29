import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceTopologySimulator } from "./ServiceTopologySimulator.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ServiceTopologySimulator golden", () => {
  it("emits exactly 7 nodes in deterministic order", async () => {
    const sim = new ServiceTopologySimulator(3);
    const p = firstValueFrom(sim.topology$());
    await vi.advanceTimersByTimeAsync(0);
    const topo = await p;
    expect(topo.nodes.map((n) => n.name)).toEqual([
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
    const pricing = topo.nodes.find((n) => n.name === "pricing");
    expect(pricing?.status).toBe("down");
  });
});
