import type { App, Stream } from "@rtc/core-api";
import { ROSTER, type RosterEntry } from "@rtc/domain";

import { EURUSD, GBPUSD, MSFT } from "#/harness/fixtures";
import type { ScriptedDriver } from "#/harness/scriptedPorts";

const NOW: number = 1_800_000_000_000;
const DEMO: RosterEntry = ROSTER[0];

export async function signIn(
  app: App,
  resolveLogin: ScriptedDriver["resolveLogin"],
  settle: () => Promise<void>,
): Promise<void> {
  app.presenters.auth.login(DEMO.username, "pw");
  await settle();
  resolveLogin({ ok: true, token: "tok", user: DEMO.user, exp: NOW + 60_000 });
  await settle();
}

/** 40 port-backed presenter streams a mounted workspace reads — a broad
 * sample of what the composition can be made to subscribe, not a proof that
 * it covers every port. */
export function everySessionStream(app: App): readonly Stream<unknown>[] {
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
    p.equityPriceHistory.history$(MSFT.symbol),
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
