import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTopology } from "../telemetry/topology.js";
import { ServiceTopologySimulator } from "./ServiceTopologySimulator.js";

// ServiceTopologySimulator.golden.test.ts pins node/edge shape and the
// serviceDown incident. It never CLEARS an incident, so the recovery path —
// the one an operator actually watches for after an incident ends — had no
// witness.

beforeEach(() => {
  return vi.useFakeTimers();
});

afterEach(() => {
  return vi.useRealTimers();
});

describe("ServiceTopologySimulator clearPerturbation", () => {
  it("brings pricing back up after a serviceDown incident ends", async () => {
    const sim = new ServiceTopologySimulator(3);

    sim.perturb("serviceDown");

    const downed = await snapshot(sim);
    const pricingDown = nodeNamed(downed, "pricing");

    expect(pricingDown.status).toBe("down");
    expect(pricingDown.health).toBe(0);

    sim.clearPerturbation();

    const recovered = await snapshot(sim);
    const pricingUp = nodeNamed(recovered, "pricing");

    expect(pricingUp.status).not.toBe("down");
    expect(pricingUp.health).toBeGreaterThan(0);
  });

  it("leaves an unperturbed topology healthy", async () => {
    const sim = new ServiceTopologySimulator(3);

    sim.clearPerturbation();

    const topo = await snapshot(sim);

    expect(
      topo.nodes.every((node) => {
        return node.health > 0;
      }),
    ).toBe(true);
  });
});

/** One emission from a fresh subscription, with the simulator's initial
 * timer flushed. */
async function snapshot(
  sim: ServiceTopologySimulator,
): Promise<ServiceTopology> {
  const pending = firstValueFrom(sim.topology$());

  await vi.advanceTimersByTimeAsync(0);

  return pending;
}

function nodeNamed(
  topo: ServiceTopology,
  name: string,
): ServiceTopology["nodes"][number] {
  const node = topo.nodes.find((candidate) => {
    return candidate.name === name;
  });

  if (!node) {
    throw new Error(`no ${name} node in topology`);
  }

  return node;
}
