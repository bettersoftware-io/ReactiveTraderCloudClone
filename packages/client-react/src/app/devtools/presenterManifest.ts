import type { PresenterManifest } from "@rtc/devtools-core";

/** Which members of each presenter the devtools observes. This is call-site
 * knowledge by design: devtools-core stays structurally typed, and this file
 * sits next to the composition wiring that knows the concrete Presenters.
 * When adding a presenter, add its entry here (the state tree panel is the
 * reminder — a missing presenter is visibly absent).
 *
 * Every entry mirrors exactly how `createViewModel` (react-bindings) reads the
 * presenter: `props` are the observable-valued properties it `bind()`s;
 * `methods` are the parameterized stream methods it binds per-arg;
 * `machine: true` marks the shared Machine seams. Presenters the ViewModel
 * touches only through one-shot command methods — `execution` (`execute`),
 * `rfqQuote` (`requestQuote`), `bootPreference` (`current`/`setVariant`) —
 * expose no observed state stream and are intentionally absent. */
export const PRESENTER_MANIFEST: PresenterManifest = {
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
