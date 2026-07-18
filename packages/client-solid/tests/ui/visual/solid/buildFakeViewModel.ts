import {
  type CurrencyPair,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_VIEW_MODE,
  resolveThemeMode,
} from "@rtc/domain";

// The visual fakes pin the skin to "classic" by default (NOT the app's "holo"
// showcase default): classic's tokens are byte-identical to the pre-redesign
// single-axis tokens, so the deferred goldens stay pixel-identical until
// Phase 3 regenerates them for the new skins. Mirrors the react driver's
// buildFakeViewModel.ts constant exactly.
const DEFAULT_THEME_SKIN_FOR_FIXTURES = "classic" as const;

// Same pin as the skin above: the visual fakes DEFAULT ambientStyle to "rays"
// (the pre-existing backdrop), NOT the app's new "aurora" default, so every
// existing golden that frames AmbientBackground stays pixel-identical. A
// fixture opts into the aurora style explicitly (see "app-fx-aurora" in
// fixtures.ts / "app/fx-aurora" in scenarios.ts) — data.ambientStyle wins
// over this default when a fixture sets it. Mirrors the react driver's
// DEFAULT_AMBIENT_STYLE_FOR_FIXTURES exactly.
const DEFAULT_AMBIENT_STYLE_FOR_FIXTURES = "rays" as const;

import type { AppData } from "@ui-visual-shared/appData";

import type {
  BootSequenceState,
  NotionalView,
  SessionUser,
} from "@rtc/client-core";
import { createDefaultLayoutPort, type WorkspaceTab } from "@rtc/client-core";
import type { ViewModel } from "@rtc/solid-bindings";

function noop(): void {}

/** Wrap a static value as a zero-arg Solid accessor — every AppData field
 * below is a plain constant (no reactivity needed for a static screenshot),
 * so this is the whole "signal" layer this fake needs. */
function at<T>(value: T): () => T {
  return () => {
    return value;
  };
}

// Fixture operator identity for visual goldens — the real DEMO_USER fixture
// was retired with the login/auth workstream; this local stand-in keeps the
// existing goldens' identity fields (name/initials/id/email/desk/clearance)
// pixel-identical. Mirrors the react driver's DEMO_USER exactly.
const DEMO_USER: SessionUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};

/** Build a static, accessor-based ViewModel from a fixture snapshot — the
 * Solid counterpart of the react driver's `buildFakeViewModel`. Member-by-
 * member this mirrors that file (same AppData mapping, same defaults); only
 * the accessor mechanics differ: react hooks re-run per render and return
 * plain values, Solid instead hands back a zero-arg `Accessor` per field
 * (`at()` below) — the value never changes within one scenario's lifetime
 * (no interaction re-seeds the fixture), so a constant closure is sufficient;
 * no `createSignal` is needed anywhere in this file. */
export function buildFakeViewModel(data: AppData): ViewModel {
  return {
    usePrice: (pair: CurrencyPair) => {
      return at(data.prices[pair.symbol] ?? null);
    },
    usePriceHistory: (symbol: string) => {
      return at(data.priceHistory[symbol] ?? []);
    },
    useTrades: () => {
      return at(data.trades);
    },
    useNewTradeIds: () => {
      return at(data.newTradeIds ?? new Set<number>());
    },
    useActivity: () => {
      return at(data.activity ?? []);
    },
    useAnalytics: () => {
      return at(data.analytics);
    },
    useRfqs: () => {
      return at(data.rfqs);
    },
    useQuotesForRfq: (rfqId: number) => {
      return at(data.quotesForRfq[rfqId] ?? []);
    },
    useAllQuotes: () => {
      return at(data.allQuotes);
    },
    useCurrencyPairs: () => {
      return at(data.currencyPairs);
    },
    useInstruments: () => {
      return at(data.instruments);
    },
    useDealers: () => {
      return at(data.dealers);
    },
    useConnectionStatus: () => {
      return at(data.connectionStatus);
    },
    // Commands: async no-op. Not exercised by static screenshots.
    useAcceptQuote: () => {
      return async (_quoteId: number) => {};
    },
    useCancelRfq: () => {
      return async (_rfqId: number) => {};
    },
    // Reconnect: static screenshots don't click buttons; no-op is correct.
    useReconnect: () => {
      return noop;
    },
    // Machine: per-symbol static snapshot for screenshots; intents are no-ops.
    // A missing key renders the same neutral state the real machine emits
    // initially ("ready" / "init"), so existing goldens are unchanged.
    useTileExecution: (pair: CurrencyPair) => {
      return {
        state: at(data.tileExecution[pair.symbol] ?? { status: "ready" }),
        execute: noop,
        dismiss: noop,
      };
    },
    useRfqTile: (pair: CurrencyPair) => {
      return {
        state: at(
          data.rfqTile[pair.symbol] ?? {
            status: "init",
            quote: null,
            remainingMs: 0,
          },
        ),
        requestQuote: noop,
        cancel: noop,
        reject: noop,
        accept: noop,
      };
    },
    // Submission machines: static snapshots for screenshots; intents are no-ops.
    useRfqSubmission: () => {
      return {
        state: at(data.rfqSubmission ?? { status: "editing" }),
        submit: noop,
      };
    },
    useTicketSubmission: () => {
      return {
        state: at(data.ticketSubmission ?? { submitted: false }),
        submitPrice: noop,
        pass: noop,
      };
    },
    // Intent-free derived flags: static snapshot for screenshots.
    useStaleFlag: (pair: CurrencyPair) => {
      return at(data.stale[pair.symbol] ?? false);
    },
    useAnalyticsStaleFlag: () => {
      return at(data.analyticsStale ?? false);
    },
    // New-row highlight: deterministic — the highlight tracks isNew instantly (no
    // timer), so the highlighted (isNew) branch is snapshotted with no waiting.
    useRowHighlight: (isNew: boolean) => {
      return at(isNew);
    },
    // Machine: static snapshot for screenshots; intents are no-ops.
    useNotional: (defaultNotional: number) => {
      const override = data.notional as NotionalView | undefined;
      const displayValue =
        override?.displayValue ??
        defaultNotional.toLocaleString("en-US", {
          maximumFractionDigits: 0,
          useGrouping: true,
        });
      return {
        state: at({
          displayValue,
          numericValue: override?.numericValue ?? defaultNotional,
          error: override?.error ?? null,
          isRfq: override?.isRfq ?? false,
          isDefault: override?.isDefault ?? true,
        }),
        change: noop,
        reset: noop,
      };
    },
    // Throughput: static snapshot for screenshots; setValue is a no-op. Defaults
    // to a loaded value of 100 (loading:false) so the slider renders.
    useThroughput: () => {
      return {
        value: at(data.throughput?.value ?? 100),
        loading: at(data.throughput?.loading ?? false),
        message: at(data.throughput?.message ?? null),
        setValue: noop,
      };
    },
    // Display preferences: static snapshots for screenshots; the cycle is a
    // no-op. `data.themeMode` is the stored PREFERENCE (dark | light | system);
    // "system" resolves deterministically to dark for the snapshot.
    useThemePreference: () => {
      const modePreference = data.themeMode ?? DEFAULT_THEME_MODE_PREFERENCE;
      return {
        mode: at(resolveThemeMode(modePreference, true)),
        modePreference: at(modePreference),
        cycle: noop,
      };
    },
    useThemeSkinPreference: () => {
      return {
        skin: at(data.themeSkin ?? DEFAULT_THEME_SKIN_FOR_FIXTURES),
        setSkin: noop,
      };
    },
    useAnimatedBackground: () => {
      return {
        enabled: at(data.animatedBackground ?? false),
        setEnabled: noop,
        toggle: noop,
      };
    },
    usePowerSaver: () => {
      const level = data.powerSaverLevel ?? "off";
      return {
        level: at(level),
        isCalm: at(level !== "off"),
        isFreeze: at(level === "freeze"),
        setLevel: noop,
        cycle: noop,
      };
    },
    useAmbientStyle: () => {
      return {
        style: at(data.ambientStyle ?? DEFAULT_AMBIENT_STYLE_FOR_FIXTURES),
        setStyle: noop,
      };
    },
    useViewModePreference: () => {
      return {
        viewMode: at(data.viewMode ?? DEFAULT_VIEW_MODE),
        setViewMode: noop,
      };
    },
    useCreditRfqFilterPreference: () => {
      return {
        filter: at(data.creditRfqFilter ?? DEFAULT_CREDIT_RFQ_FILTER),
        setFilter: noop,
      };
    },
    useEqWatchlistSort: () => {
      return {
        sort: at(data.eqWatchlistSort ?? DEFAULT_EQ_WATCHLIST_SORT),
        setSort: noop,
        cycle: noop,
      };
    },
    useEqBlotterView: () => {
      return {
        view: at(data.eqBlotterView ?? DEFAULT_EQ_BLOTTER_VIEW),
        setView: noop,
      };
    },
    // Auth: static snapshot for screenshots. Defaults to authenticated +
    // unlocked, so the LockScreen overlay renders nothing and existing
    // goldens are unchanged.
    useAuth: () => {
      return {
        state: at({
          status: "authenticated" as const,
          user: DEMO_USER,
          locked: data.sessionLocked ?? false,
          error: null,
        }),
        login: (): void => {
          return;
        },
        unlock: (): void => {
          return;
        },
        lock: (): void => {
          return;
        },
        logout: (): void => {
          return;
        },
      };
    },
    // Boot gate: hidden for screenshots (the visual tier mounts BootSequence
    // directly when it wants the splash; BootGate itself is never framed).
    useBootGate: () => {
      return { visible: at(false), reboot: noop, dismiss: noop };
    },
    // Countdown: static snapshot for visual goldens — returns totalMs so the bar
    // renders at 100% fill (deterministic; never wall-clock-dependent).
    useRfqCountdown: (_creationTimestamp: number, totalMs: number) => {
      return at(totalMs);
    },
    // Animation intents: static screenshots never fire intents, so the bar
    // renders in its neutral, un-animated state.
    useAnimationIntents: (_target: string) => {
      return at(null);
    },
    // Layout: static snapshot for screenshots — returns the tab's default
    // arrangement with noop intents (no drag, no maximize during capture).
    useLayout: (tab: WorkspaceTab) => {
      return {
        state: at(createDefaultLayoutPort(tab).initial),
        maximize: noop,
        restore: noop,
        collapse: noop,
        expand: noop,
        resize: noop,
      };
    },
    // Boot sequence: visual goldens capture post-boot UI; return a static initial
    // state with noop skip. The BootSequence component is not rendered in any
    // existing golden scenario.
    useBootSequence: (_onDone: () => void) => {
      const state: BootSequenceState = {
        variant: "core",
        progress: 0,
        done: false,
      };
      return { state: at(state), skip: noop };
    },
    // Equities: data-driven fakes reading from the AppData equities fields.
    // Fixtures that don't set these fields return the same empty defaults as
    // the old no-op stubs, so all pre-equities goldens stay pixel-identical.
    useWatchlist: () => {
      return at(data.equityWatchlist ?? []);
    },
    useEquityQuote: (symbol: string) => {
      return at(data.equityQuotes?.[symbol] ?? null);
    },
    useCandles: (symbol: string) => {
      return at(data.equityCandles?.[symbol] ?? []);
    },
    useDepth: (symbol: string) => {
      return at(data.equityDepth?.[symbol] ?? null);
    },
    useEquityOrders: () => {
      return at(data.equityOrders ?? []);
    },
    useEquityPositions: () => {
      return at(data.equityPositions ?? []);
    },
    useOrderTicket: (defaultSymbol: string) => {
      const state = data.equityOrderTicket ?? {
        phase: "editing" as const,
        form: {
          symbol: defaultSymbol,
          side: "buy" as const,
          type: "market" as const,
          qty: 0,
        },
        error: null,
      };
      return {
        state: at(state),
        setSymbol: noop,
        setSide: noop,
        setType: noop,
        setQty: noop,
        setLimitPrice: noop,
        submit: noop,
        reset: noop,
      };
    },
    // Admin / telemetry (Phase 5): data-driven fakes reading from AppData admin
    // fields. Fixtures that don't set these fields return the same empty defaults
    // as the old no-op stubs, so all pre-admin goldens stay pixel-identical.
    useMetrics: () => {
      return {
        throughput: at(data.adminMetrics?.throughput ?? []),
        latency: at(data.adminMetrics?.latency ?? []),
        errorRate: at(data.adminMetrics?.errorRate ?? []),
      };
    },
    useTopology: () => {
      return at(data.adminTopology ?? null);
    },
    useEventLog: () => {
      return at(data.adminEventLog ?? []);
    },
    useSessions: () => {
      return at(data.adminSessions ?? []);
    },
    useSessionCountSeries: () => {
      return at(data.adminSessionCountSeries ?? []);
    },
    useIncident: () => {
      return {
        state: at(data.adminIncident ?? { active: [] }),
        inject: noop,
        clear: noop,
      };
    },
    // Eq workspace: static snapshot for screenshots; intents are no-ops (no
    // tab switch/close/timeframe change during capture).
    useEqWorkspace: () => {
      return {
        state: at(
          data.equityWorkspace ?? {
            sel: "",
            openTabs: [],
            timeframe: "1D" as const,
          },
        ),
        select: noop,
        closeTab: noop,
        setTimeframe: noop,
      };
    },
  };
}
