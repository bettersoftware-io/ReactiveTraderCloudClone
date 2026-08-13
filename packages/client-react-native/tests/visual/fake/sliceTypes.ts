import type { ViewModel } from "@rtc/react-bindings";

/**
 * The key partition of `ViewModel` across the fake's seven slice modules.
 *
 * **Why a partition rather than one 600-line file.** The web sibling
 * (`packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`) is a
 * single 594-line object literal. That works, but it makes every change to any
 * one module a change to the same file — and it cannot be worked on by more
 * than one person at a time. Splitting by module gives each slice its own
 * fixtures, its own test, and its own reviewer.
 *
 * **Why `Pick` aliases rather than `Partial<ViewModel>`.** A `Partial` slice
 * would let a hook silently belong to no slice at all: the composed object
 * would still typecheck as `Partial`, and the missing hook would surface at
 * capture time as `undefined is not a function` — one scenario rendering
 * blank, which looks entirely plausible in a list of 21 filenames. With
 * `Pick`, `buildFakeViewModel` can be typed `ViewModel` with **no cast**, so
 * TypeScript proves at the composition site that every member of `ViewModel`
 * is present. Completeness by construction, the same way the fake gets
 * determinism by construction.
 *
 * That guarantee has already paid for itself twice. `loadOlderCandles` — the
 * only member that is not a `use*` hook — was missing from the first draft of
 * this partition, and the hand-written verification of it reported a confident
 * 67 of 67 because it defined "member" as `use*`-prefixed on BOTH sides of the
 * comparison, so it agreed with itself. Then a catch-up merge grew `ViewModel`
 * by three (`useDockLayoutStore`, `useLayoutEngine`, `useWorkspaceReset`) and
 * the compiler named all three immediately. Nobody has to remember to widen
 * this file; the build refuses until someone does.
 *
 * Disjointness (no hook claimed by two slices) is not expressible here — it is
 * asserted at runtime by `buildFakeViewModel.test.tsx`, which counts the keys
 * each slice contributes and fails on a duplicate.
 */
export type ShellSlice = Pick<
  ViewModel,
  | "useAmbientStyle"
  | "useAnimatedBackground"
  | "useAuth"
  | "useBootGate"
  | "useBootSequence"
  | "useConnectionStatus"
  | "useForceBootAnimation"
  | "useIncident"
  | "useLoginWaitPreferences"
  | "usePowerSaver"
  | "useReconnect"
  | "useThemePreference"
  | "useThemeSkinPreference"
  | "useViewModePreference"
>;

/** FX blotter: the trade roster, the newest-row highlight set, and the
 * Activity tab's derived stream. */
export type BlotterSlice = Pick<
  ViewModel,
  "useActivity" | "useNewTradeIds" | "useTrades"
>;

/** FX rates: the currency-pair reference data, per-pair pricing, and the
 * spot-tile / ticket machines. */
export type RatesSlice = Pick<
  ViewModel,
  | "useCurrencyPairs"
  | "useNotional"
  | "usePrice"
  | "usePriceHistory"
  | "useRowHighlight"
  | "useStaleFlag"
  | "useTileExecution"
>;

/** Credit: RFQs, their quotes, the dealer/instrument reference data, and the
 * buy-side / sell-side submission machines. */
export type CreditSlice = Pick<
  ViewModel,
  | "useAcceptQuote"
  | "useAllQuotes"
  | "useCancelRfq"
  | "useCreditRfqFilterPreference"
  | "useDealers"
  | "useInstruments"
  | "useQuotesForRfq"
  | "useRfqCountdown"
  | "useRfqs"
  | "useRfqSubmission"
  | "useRfqTile"
  | "useTicketSubmission"
>;

/**
 * Equities: the watchlist, per-symbol quotes and candles, the depth book, the
 * order ticket machine, and the orders/positions blotters.
 *
 * `loadOlderCandles` is the one member of `ViewModel` that is not a `use*`
 * hook — a bare command, paired with `useCandleBackfill`'s state. It is worth
 * knowing how it was found: the partition was first derived by grepping
 * `ViewModel` for `^  use[A-Za-z]+`, which reported a tidy 67 of 67 and could
 * not see this member at all. Both sides of that check shared the same wrong
 * definition of "a member", so it agreed with itself. What actually caught it
 * was `buildFakeViewModel` being typed `ViewModel` with no cast — the reason
 * that decision was taken.
 */
export type EquitiesSlice = Pick<
  ViewModel,
  | "loadOlderCandles"
  | "useCandleBackfill"
  | "useCandles"
  | "useChartSubstrate"
  | "useDepth"
  | "useEqBlotterView"
  | "useEqDrawings"
  | "useEqWatchlistSort"
  | "useEqWorkspace"
  | "useEquityOrders"
  | "useEquityPositions"
  | "useEquityQuote"
  | "useOrderTicket"
  | "useWatchlist"
>;

/** Analytics: the position book and its staleness flag. */
export type AnalyticsSlice = Pick<
  ViewModel,
  "useAnalytics" | "useAnalyticsStaleFlag"
>;

/**
 * Every hook no React Native surface reads today — Jarvis, the admin/telemetry
 * lenses, the web-only workspace and layout seams.
 *
 * These exist for type completeness alone, so their values are inert: empty
 * collections, `null`, and no-op intents. **Do not add fixtures here.** A hook
 * that starts being read by an RN screen belongs in that screen's slice, where
 * its value is chosen for a scenario rather than inherited from a bucket named
 * "unused".
 */
export type InertSlice = Pick<
  ViewModel,
  | "useAnimationIntents"
  | "useDockLayoutStore"
  | "useEventLog"
  | "useJarvis"
  | "useJarvisDemo"
  | "useJarvisDriver"
  | "useJarvisPanelData"
  | "useJarvisPanels"
  | "useJarvisPreferences"
  | "useJarvisUsage"
  | "useLayout"
  | "useLayoutEngine"
  | "useMetrics"
  | "useSessionCountSeries"
  | "useSessions"
  | "useThroughput"
  | "useTopology"
  | "useWorkspaceNav"
  | "useWorkspaceReset"
>;
