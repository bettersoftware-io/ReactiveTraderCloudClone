import { describe, expect, it, vi } from "vitest";

import type { App, Stream } from "@rtc/core-api";
import { ROSTER, type RosterEntry } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { EURUSD, GBPUSD, MSFT } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import type { ScriptedDriver } from "#/harness/scriptedPorts";
import {
  createPanelEvent,
  FX_TICKS_SPEC,
  replyToTurn,
} from "#/suites/workspaceKit";

const NOW: number = 1_800_000_000_000;
const DEMO: RosterEntry = ROSTER[0];

/** `app.dispose()` releases everything the composition holds: after it, no
 * stream any port method returned has a live subscription, and nothing the
 * app wired keeps reacting to its own presenters. A property of the whole
 * composition, so it is not keyed by member. The first case runs a realistic
 * session first — sign in through `presenters.auth`, a Jarvis turn that
 * spawns a live price panel and docks it, then one warm period on 39
 * port-backed presenter streams a mounted workspace reads — so what dispose
 * must release is whatever that session left the app holding, not only what
 * composition alone opens. */
export function describeDisposeContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(`${label} :: dispose`, () => {
    it("after a signed-in session, dispose() leaves no port stream subscribed", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ transport: true, countPortStreams: true });

        try {
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          await replyToTurn(
            h,
            [createPanelEvent("ticks", FX_TICKS_SPEC)],
            clock.settle,
          );
          h.app.presenters.dockPanel("ticks");
          await clock.settle();
          const warm = everySessionStream(h.app).map((stream) => {
            return collect(stream);
          });
          await clock.settle();

          for (const c of warm) {
            c.unsubscribe();
          }

          await clock.settle();
          // A positive witness first: the session left the app holding SOME
          // port stream, so a zero after dispose() is a release, not a
          // counter nobody fed.
          expect(h.driver.livePortSubscriptions()).toBeGreaterThan(0);
          await h.app.dispose();
          await clock.settle();
          expect(h.driver.livePortSubscriptions()).toBe(0);
        } finally {
          await h.teardown();
        }
      });
    });

    it("dispose() releases the transport gate: a later sign-out does not disconnect", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ transport: true });

        try {
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          expect(h.driver.transportCalls()).toEqual(["disconnect", "connect"]);
          await h.app.dispose();
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["disconnect", "connect"]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a Jarvis turn still in flight at dispose() releases its ask", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ countPortStreams: true });

        try {
          h.app.presenters.jarvis.intents.send("still thinking");
          await clock.settle();
          // A positive witness first: the ask is open and unanswered.
          expect(h.driver.pendingAsks()).toEqual(["still thinking"]);
          expect(h.driver.livePortSubscriptions()).toBeGreaterThan(0);
          await h.app.dispose();
          await clock.settle();
          expect(h.driver.livePortSubscriptions()).toBe(0);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a resumed session's transport gate is released by dispose(): a later sign-out does not disconnect", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({
          transport: true,
          session: {
            token: "stored",
            user: DEMO.user,
            username: DEMO.username,
            exp: NOW + 60_000,
          },
        });

        try {
          expect(h.driver.transportCalls()).toEqual(["connect"]);
          await h.app.dispose();
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["connect"]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("dispose() resolves when called twice", async () => {
      const h = makeHarness();

      try {
        await expect(h.app.dispose()).resolves.toBeUndefined();
        await expect(h.app.dispose()).resolves.toBeUndefined();
      } finally {
        await h.teardown();
      }
    });
  });
}

async function signIn(
  app: App,
  resolveLogin: ScriptedDriver["resolveLogin"],
  settle: () => Promise<void>,
): Promise<void> {
  app.presenters.auth.login(DEMO.username, "pw");
  await settle();
  resolveLogin({ ok: true, token: "tok", user: DEMO.user, exp: NOW + 60_000 });
  await settle();
}

/** 39 port-backed presenter streams a mounted workspace reads — a broad
 * sample of what the composition can be made to subscribe, not a proof that
 * it covers every port. */
function everySessionStream(app: App): readonly Stream<unknown>[] {
  const p = app.presenters;

  return [
    p.priceStream.price$(EURUSD),
    p.priceHistory.history$(GBPUSD.symbol),
    p.blotter.trades$,
    p.blotter.activity$,
    p.analytics.position$,
    p.execution.executions$,
    p.currencyPairs.pairs$,
    p.connection.status$,
    p.rfqs.rfqs$,
    p.rfqs.events$,
    p.dealers.list$,
    p.instruments.list$,
    p.watchlist.watchlist$,
    p.watchlist.quote$(MSFT.symbol),
    p.candleSeries.candles$(MSFT.symbol),
    p.depth.depth$(MSFT.symbol),
    p.ordersBlotter.orders$,
    p.ordersBlotter.fills$,
    p.positions.positions$,
    p.throughput.state$,
    p.throughputMetric.samples$,
    p.latencyMetric.samples$,
    p.errorRateMetric.samples$,
    p.topology.topology$,
    p.eventLog.events$,
    p.sessions.sessions$,
    p.sessionsKpi.countSeries$,
    p.jarvis.state$,
    p.jarvisUsage.usage$,
    p.jarvisPanels.panels$,
    p.themePreference.mode$,
    p.themeSkinPreference.skin$,
    p.powerSaver.level$,
    p.layoutEngine.engine$,
    p.animationDirector.intentsFor(EURUSD.symbol),
    p.layoutFor("fx").state$,
    p.layoutFor("equities").state$,
    p.dockedPanelIdsFor("fx"),
    p.auth.state$,
  ];
}
