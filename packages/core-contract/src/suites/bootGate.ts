import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** `presenters.bootGate` — whether the boot splash is showing, seeded once
 * from the platform's `bootSplash.shouldPlay()`. */
export function describeBootGateContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("with no bootSplash port it starts visible", async () => {
      const h = makeHarness();

      try {
        const gate = h.app.presenters.bootGate;
        const c = collect(gate.visible$);
        expect(gate.visible).toBe(true);
        expect(c.values).toEqual([true]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("starts at what the bootSplash port decides", async () => {
      const h = makeHarness({ bootSplash: false });

      try {
        const gate = h.app.presenters.bootGate;
        const c = collect(gate.visible$);
        expect(gate.visible).toBe(false);
        expect(c.values).toEqual([false]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    // The getter is synchronous in every core; a SUBSCRIBER hears the change
    // after a settle — the Effect core follows its ref on a fiber (slice-6
    // ledger B-1).
    it("dismiss hides and reboot shows — through the getter synchronously and to a subscriber; a late subscriber gets the current value", async () => {
      const h = makeHarness();

      try {
        const gate = h.app.presenters.bootGate;
        const c = collect(gate.visible$);
        gate.dismiss();
        expect(gate.visible).toBe(false);
        await settle();
        expect(c.values).toEqual([true, false]);
        gate.reboot();
        expect(gate.visible).toBe(true);
        await settle();
        expect(c.values).toEqual([true, false, true]);
        gate.dismiss();
        await settle();
        const late = collect(gate.visible$);
        expect(late.values).toEqual([false]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
