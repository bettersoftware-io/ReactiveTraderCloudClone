import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createTick, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeStaleFlagContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts false synchronously; the first CONNECTING → CONNECTED transition is a reconnect, stale until the first price", async () => {
      const h = makeHarness();
      const m = h.machines.staleFlag(EURUSD);

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([false]);
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        expect(c.values).toEqual([false, true]);
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(c.values).toEqual([false, true, false]);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        h.driver.tickPrice(createTick("EURUSD", 1.3));
        await settle();
        expect(c.values).toEqual([false, true, false]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("goes stale on reconnect with no new price and clears on the next price; an idle disconnect counts as a disconnect", async () => {
      const h = makeHarness();
      const m = h.machines.staleFlag(EURUSD);

      try {
        const c = collect(m.state$);
        // Driven as two separate settled steps, not one synchronous burst:
        // the connection transition and the price tick can arrive through
        // ports with different delivery latency (a native core's connection
        // fold is fiber-scheduled, a delegated price stream is synchronous
        // RxJS), so settling between them fixes their relative order instead
        // of leaving it to whichever port happens to settle first.
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(c.values.at(-1)).toBe(false);
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        expect(c.values.at(-1)).toBe(true);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        await settle();
        expect(c.values.at(-1)).toBe(false);
        // IDLE_DISCONNECTED only leaves via a user-initiated "reconnect" — a
        // bare gatewayConnected is ignored in that state (connectionStatus.ts),
        // so recovering needs both events, in this order.
        h.driver.emitConnection({ type: "idleTimeout" });
        h.driver.emitConnection({ type: "reconnect" });
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        expect(c.values.at(-1)).toBe(true);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose() after the last unsubscribe ends the machine's keep-alive; a fresh subscription afterwards yields the current value synchronously", async () => {
      const h = makeHarness();
      const m = h.machines.staleFlag(EURUSD);

      try {
        const c = collect(m.state$);
        // See the note above: settle between a connection transition and a
        // price tick so their relative order is fixed across cores.
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(c.values).toEqual([false, true, false]);
        // Mirrors real usage (useMachine disposes only after the component's
        // own subscription has unmounted) — dispose() alone does not stop a
        // STILL-SUBSCRIBED external consumer, since it only unsubscribes the
        // machine's internal keep-alive, not every subscriber of state$.
        c.unsubscribe();
        m.dispose();
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        const fresh = collect(m.state$);
        expect(fresh.values).toEqual([false]);
        fresh.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
