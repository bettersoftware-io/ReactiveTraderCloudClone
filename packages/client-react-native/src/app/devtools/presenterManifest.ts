import type { PresenterManifest } from "@rtc/devtools-core";

/** Which members of each presenter the RN devtools observes — the React-Native
 * call-site copy of client-react's manifest. devtools-core stays structurally
 * typed, so this concrete map lives next to the composition root. Entries mirror
 * how `createViewModel` reads each presenter: `props` are the observable-valued
 * properties, `methods` are parameterized stream methods, `machine: true` marks
 * shared Machine seams. Command-only presenters (execution, rfqQuote,
 * bootPreference) expose no observed state and are intentionally absent. */
export const NATIVE_PRESENTER_MANIFEST: PresenterManifest = {
  priceStream: { methods: ["price$"] },
  priceHistory: { methods: ["history$"] },
  blotter: { props: ["trades$", "newTradeIds$", "activity$"] },
  analytics: { props: ["position$"] },
  rfqs: { props: ["rfqs$", "allQuotes$"], methods: ["quotesForRfq$"] },
  currencyPairs: { props: ["pairs$"] },
  instruments: { props: ["list$"] },
  dealers: { props: ["list$"] },
  connection: { props: ["status$"] },
  throughput: { props: ["state$"] },
  themePreference: { props: ["mode$", "modePreference$"] },
  themeSkinPreference: { props: ["skin$"] },
  animatedBackground: { props: ["enabled$"] },
  viewModePreference: { props: ["viewMode$"] },
  creditRfqFilterPreference: { props: ["filter$"] },
  eqWatchlistSortPreference: { props: ["sort$"] },
  eqBlotterViewPreference: { props: ["view$"] },
  animationDirector: { methods: ["intentsFor"] },
  bootGate: { props: ["visible$"] },
  session: { props: ["state$"] },
  watchlist: { props: ["watchlist$"], methods: ["quote$"] },
  candleSeries: { methods: ["candles$"] },
  depth: { methods: ["depth$"] },
  ordersBlotter: { props: ["orders$"] },
  positions: { props: ["positions$"] },
  incident: { machine: true },
  eqWorkspace: { machine: true },
  throughputMetric: { props: ["samples$"] },
  latencyMetric: { props: ["samples$"] },
  errorRateMetric: { props: ["samples$"] },
  topology: { props: ["topology$"] },
  eventLog: { props: ["events$"] },
  sessions: { props: ["sessions$"] },
  sessionsKpi: { props: ["countSeries$"] },
};
