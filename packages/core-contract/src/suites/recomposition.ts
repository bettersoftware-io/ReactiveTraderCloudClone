import { describe, expect, it, vi } from "vitest";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createTick, createTrade, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { CONSTRUCTION_TIME_PORT_METHODS } from "#/suites/portDiscipline";
import { everySessionStream, signIn } from "#/suites/sessionKit";

const NOW: number = 1_800_000_000_000;
const SEED = { transport: true, countPortStreams: true } as const;

/** A hot swap composes a second core over the SAME port objects after the
 * first was disposed. Every case here signs in or changes state on the first
 * composition, calls `h.recompose()`, and reads what the second one starts
 * from — so a core that only works over pristine ports, or whose dispose
 * leaves something behind for its successor, fails here. A property of the
 * whole composition, so it is not keyed by member. */
export function describeRecompositionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(`${label} :: recomposition`, () => {
    it("a second composition over the same ports resumes the session without a login", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness(SEED);

        try {
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          const b = await h.recompose();
          const auth = collect(b.presenters.auth.state$);
          await clock.settle();
          expect(auth.values[0]?.status).toBe("authenticated");
          expect(h.driver.pendingLogins()).toEqual([]);
          // One extra connect, and no disconnect caused by the swap: the
          // gate of the first composition was released silently.
          expect(h.driver.transportCalls()).toEqual([
            "disconnect",
            "connect",
            "connect",
          ]);
          auth.unsubscribe();
          // The first composition's transport gate went with it: signing
          // out of the DISPOSED app must not reach the shared transport.
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual([
            "disconnect",
            "connect",
            "connect",
          ]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a second composition calls each port method as often as a first", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness(SEED);

        try {
          const first = CONSTRUCTION_TIME_PORT_METHODS.map((name) => {
            return h.driver.portCalls(name);
          });

          for (const [
            index,
            name,
          ] of CONSTRUCTION_TIME_PORT_METHODS.entries()) {
            // A positive witness: a name nothing called would pass `0 === 0`.
            expect(first[index], name).toBeGreaterThanOrEqual(1);
          }

          await h.recompose();
          await clock.settle();

          for (const [
            index,
            name,
          ] of CONSTRUCTION_TIME_PORT_METHODS.entries()) {
            expect(h.driver.portCalls(name), name).toBe(first[index] * 2);
          }
        } finally {
          await h.teardown();
        }
      });
    });

    it("values the ports emit after the swap reach the second composition", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness(SEED);

        try {
          const b = await h.recompose();
          const trades = collect(b.presenters.blotter.trades$);
          const prices = collect(b.presenters.priceStream.price$(EURUSD));
          const snapshot = [createTrade({ tradeId: 1 })];
          h.driver.emitTrades(snapshot);
          h.driver.tickPrice(createTick("EURUSD", 1.1));
          await clock.settle();
          expect(trades.values).toEqual([snapshot]);
          expect(prices.values).toHaveLength(1);
          trades.unsubscribe();
          prices.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a warm second composition holds as many port subscriptions as a warm first", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness(SEED);

        try {
          const warm = await warmSession(h.app, clock.settle);
          const n = h.driver.livePortSubscriptions();
          // A positive witness: the first session holds SOME port stream.
          expect(n).toBeGreaterThan(0);
          warm();
          await clock.settle();
          const b = await h.recompose();
          const warmB = await warmSession(b, clock.settle);
          expect(h.driver.livePortSubscriptions()).toBe(n);
          warmB();
        } finally {
          await h.teardown();
        }
      });
    });

    it("after the second composition's dispose() no port stream stays subscribed", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness(SEED);

        try {
          const b = await h.recompose();
          const release = await warmSession(b, clock.settle);
          expect(h.driver.livePortSubscriptions()).toBeGreaterThan(0);
          release();
          await clock.settle();
          await b.dispose();
          await clock.settle();
          expect(h.driver.livePortSubscriptions()).toBe(0);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a preference changed before the swap is what the second composition starts from", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness(SEED);

        try {
          const before = collect(h.app.presenters.themePreference.mode$);
          const initial = before.values.at(-1);
          h.app.presenters.themePreference.cycle();
          await clock.settle();
          const cycled = before.values.at(-1);
          // A positive witness: the cycle moved the mode.
          expect(cycled).not.toBe(initial);
          before.unsubscribe();
          const b = await h.recompose();
          const after = collect(b.presenters.themePreference.mode$);
          expect(after.values[0]).toBe(cycled);
          after.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });
  });
}

/** Warm every session stream of `app`; the returned function releases them. */
async function warmSession(
  app: Parameters<typeof everySessionStream>[0],
  settle: () => Promise<void>,
): Promise<() => void> {
  const warm = everySessionStream(app).map((stream) => {
    return collect(stream);
  });
  await settle();

  return () => {
    for (const c of warm) {
      c.unsubscribe();
    }
  };
}
