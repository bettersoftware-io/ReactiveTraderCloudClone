import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { ServiceHealthPort } from "../serviceHealthPort.js";

export interface ServiceHealthHarness {
  port: ServiceHealthPort;
  /** Advance the simulator clock by `ms` (vi.advanceTimersByTimeAsync). */
  advance: (ms: number) => Promise<void>;
  teardown: () => void;
}

export function describeServiceHealthPortContract(
  label: string,
  makeHarness: () => ServiceHealthHarness,
): void {
  describe(`${label} :: ServiceHealthPort contract`, () => {
    it("topology$ emits a ServiceTopology with non-empty nodes and edges", async () => {
      const { port, teardown } = makeHarness();

      try {
        const topology = await firstValueFrom(port.topology$());
        expect(topology.nodes.length).toBeGreaterThan(0);
        expect(topology.edges.length).toBeGreaterThan(0);
      } finally {
        teardown();
      }
    });

    it("topology$ nodes carry a health in [0, 100] consistent with their status thresholds", async () => {
      const { port, teardown } = makeHarness();

      try {
        const topology = await firstValueFrom(port.topology$());

        for (const node of topology.nodes) {
          expect(node.health).toBeGreaterThanOrEqual(0);
          expect(node.health).toBeLessThanOrEqual(100);

          if (node.health >= 95) {
            expect(node.status).toBe("ok");
          } else if (node.health >= 70) {
            expect(node.status).toBe("degraded");
          } else {
            expect(node.status).toBe("down");
          }
        }
      } finally {
        teardown();
      }
    });

    it("topology$ keeps emitting on the simulator cadence", async () => {
      const { port, advance, teardown } = makeHarness();

      try {
        let count = 0;
        const sub = port.topology$().subscribe(() => {
          count++;
        });
        await advance(5_000);
        sub.unsubscribe();
        expect(count).toBeGreaterThan(1);
      } finally {
        teardown();
      }
    });
  });
}
