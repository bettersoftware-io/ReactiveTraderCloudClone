import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createInstrument } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeInstrumentsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("list$ has no value until the roster arrives, then delivers the roster itself", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.instruments.list$);
        expect(c.values).toEqual([]);
        const roster = [
          createInstrument({ id: 1 }),
          createInstrument({ id: 2 }),
        ];
        h.driver.emitInstruments(roster);
        await settle();
        expect(c.values).toHaveLength(1);
        expect(c.values[0]).toBe(roster);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("stays warm across zero subscribers: the port stays observed and a fresh subscriber replays the roster synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.instruments.list$);
        const roster = [createInstrument({ id: 1 })];
        h.driver.emitInstruments(roster);
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.instrumentsObserved()).toBe(true);
        const again = collect(h.app.presenters.instruments.list$);
        expect(again.values).toEqual([roster]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
