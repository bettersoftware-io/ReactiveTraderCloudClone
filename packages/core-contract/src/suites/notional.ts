import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const INITIAL = {
  displayValue: "1,000,000",
  numericValue: 1_000_000,
  error: null,
  isRfq: false,
  isDefault: true,
};

export function describeNotionalContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts from the formatted default synchronously; a default above the RFQ threshold is flagged", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);
      const rfq = h.machines.notional(20_000_000);

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([INITIAL]);
        const r = collect(rfq.state$);
        expect(r.values[0]?.isRfq).toBe(true);
        expect(r.values[0]?.displayValue).toBe("20,000,000");
        c.unsubscribe();
        r.unsubscribe();
      } finally {
        m.dispose();
        rfq.dispose();
        await h.teardown();
      }
    });

    it("change() parses and reformats, expands k/m, marks the default, flags RFQ", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);

      try {
        const c = collect(m.state$);
        m.intents.change("2m");
        await settle();
        expect(c.values.at(-1)).toEqual({
          displayValue: "2,000,000",
          numericValue: 2_000_000,
          error: null,
          isRfq: false,
          isDefault: false,
        });
        m.intents.change("15m");
        await settle();
        expect(c.values.at(-1)?.isRfq).toBe(true);
        m.intents.change("500k");
        await settle();
        expect(c.values.at(-1)?.numericValue).toBe(500_000);
        m.intents.change("1m");
        await settle();
        expect(c.values.at(-1)?.isDefault).toBe(true);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("change() keeps the raw input with an error on a parse failure, and flags max exceeded while keeping the value", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);

      try {
        const c = collect(m.state$);
        m.intents.change("abc");
        await settle();
        expect(c.values.at(-1)).toEqual({
          displayValue: "abc",
          numericValue: 0,
          error: "Invalid input",
          isRfq: false,
          isDefault: false,
        });
        m.intents.change("2000m");
        await settle();
        expect(c.values.at(-1)?.error).toBe("Max exceeded");
        expect(c.values.at(-1)?.numericValue).toBe(2_000_000_000);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("reset() returns to the initial view; dispose() after the last unsubscribe ends the machine's keep-alive; a fresh subscription afterwards yields the current value synchronously", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);

      try {
        const c = collect(m.state$);
        m.intents.change("2m");
        await settle();
        m.intents.reset();
        await settle();
        expect(c.values.at(-1)).toEqual(INITIAL);
        // Mirrors real usage (useMachine disposes only after the component's
        // own subscription has unmounted) — dispose() alone does not stop a
        // STILL-SUBSCRIBED external consumer, since it only unsubscribes the
        // machine's internal keep-alive, not every subscriber of state$.
        c.unsubscribe();
        m.dispose();
        m.intents.change("3m");
        await settle();
        const fresh = collect(m.state$);
        expect(fresh.values).toEqual([INITIAL]);
        fresh.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
