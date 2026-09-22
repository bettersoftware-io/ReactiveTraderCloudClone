import { describe, expect, it } from "vitest";

import type { ServiceTopology } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** `topology` (ruling 3): a warm MIRROR over `ServiceHealthPort.topology$()`
 * — no seed, silent until the port emits, latest retained across a full
 * unsubscribe (`refCount: false`). */
export function describeTopologyContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("is silent until the port emits", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.topology.topology$);
        await settle();
        expect(c.values).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("mirrors each snapshot the port emits, in order", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.topology.topology$);
        const t1 = createServiceTopology(95);
        h.driver.emitTopology(t1);
        await settle();
        expect(c.values).toEqual([t1]);
        const t2 = createServiceTopology(60);
        h.driver.emitTopology(t2);
        await settle();
        expect(c.values).toEqual([t1, t2]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("retains the latest snapshot across a full unsubscribe for a late subscriber", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.topology.topology$);
        const t1 = createServiceTopology(95);
        h.driver.emitTopology(t1);
        await settle();
        c.unsubscribe();
        const late = collect(h.app.presenters.topology.topology$);
        expect(late.values).toEqual([t1]);
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

function createServiceTopology(health: number): ServiceTopology {
  return {
    nodes: [
      { name: "pricing", status: "ok", health, throughput: 100, latencyMs: 5 },
    ],
    edges: [],
  };
}
