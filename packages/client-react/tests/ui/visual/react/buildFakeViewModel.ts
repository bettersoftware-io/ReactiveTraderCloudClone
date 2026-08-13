import {
  type CurrencyPair,
  DEFAULT_CHART_SUBSTRATE,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_SKIN,
  DEFAULT_LAYOUT_ENGINE,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_VIEW_MODE,
  JARVIS_BRAINS,
  resolveThemeMode,
} from "@rtc/domain";

// The visual fakes pin the skin to "classic" by default (NOT the app's "holo"
// showcase default): classic's tokens are byte-identical to the pre-redesign
// single-axis tokens, so the deferred goldens stay pixel-identical until
// Phase 3 regenerates them for the new skins.
const DEFAULT_THEME_SKIN_FOR_FIXTURES = "classic" as const;

// Same pin as the skin above: the visual fakes DEFAULT ambientStyle to "rays"
// (the pre-existing backdrop), NOT the app's new "aurora" default, so every
// existing golden that frames AmbientBackground stays pixel-identical. A
// fixture opts into the aurora style explicitly (see "app-fx-aurora" in
// fixtures.ts / "app/fx-aurora" in scenarios.ts) — data.ambientStyle wins
// over this default when a fixture sets it.
const DEFAULT_AMBIENT_STYLE_FOR_FIXTURES = "rays" as const;

// JarvisOrb is embedded in every HeaderChrome (hence every App/chrome-header
// golden) and JarvisOverlay in every App shot — so this default must stay
// pixel-identical to the pre-Task-10 stub for every fixture that does NOT set
// `jarvis`: closed, unread 0, idle, EMPTY entries (JarvisOrb never reads
// entries; JarvisOverlay renders null while closed, so entries are inert
// either way — kept `[]` rather than the machine's real greeting-seeded
// INITIAL so none of those ~700 pre-existing goldens need re-pinning).
const DEFAULT_JARVIS_STATE_FOR_FIXTURES: JarvisState = {
  open: false,
  skin: DEFAULT_JARVIS_SKIN,
  unread: 0,
  unreadNarration: false,
  phase: "idle",
  entries: [],
  pendingConfirmation: null,
  available: true,
  // Neither field is read by any pre-Task-10 component (JarvisOrb/
  // JarvisOverlay don't render a brain picker yet), so any consistent,
  // offered value keeps every existing golden pixel-identical.
  brains: JARVIS_BRAINS,
  effectiveBrain: DEFAULT_JARVIS_BRAIN,
  // No fixture exercises a budget gate (Task 6/8 scenarios add that
  // separately) — every existing golden stays pixel-identical.
  gate: null,
  // Matches INITIAL's own 0 (never-opened session) — no pre-Task-10
  // component reads it yet, so this keeps every existing golden
  // pixel-identical.
  openCount: 0,
};

import type { AppData } from "@ui-visual-shared/appData";
import { useState } from "react";
import { EMPTY } from "rxjs";

import type {
  BootSequenceState,
  JarvisDemoState,
  JarvisDriverState,
  JarvisPanelVm,
  JarvisState,
  LayoutState,
  NotionalView,
  SessionUser,
} from "@rtc/client-core";
import {
  createDefaultLayoutPort,
  createLayoutMachine,
  InMemoryDockLayoutStore,
  JARVIS_DEMO_STEPS,
  type WorkspaceTab,
} from "@rtc/client-core";
import type { ViewModel } from "@rtc/react-bindings";

function noop(): void {}

// No visual fixture exercises the dockview engine yet (useLayoutEngine below
// is pinned to "inhouse"), so this store is never actually read/written by a
// golden scenario — a single module-level instance is fine (no per-call
// isolation needed, unlike the contract tier's per-World store).
const dockStore = new InMemoryDockLayoutStore();

// Fixture operator identity for visual goldens — the real DEMO_USER fixture
// was retired with the login/auth workstream; this local stand-in keeps the
// existing goldens' identity fields (name/initials/id/email/desk/clearance)
// pixel-identical.
const DEMO_USER: SessionUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};

export function buildFakeViewModel(data: AppData): ViewModel {
  return {
    usePrice: (pair: CurrencyPair) => {
      return data.prices[pair.symbol] ?? null;
    },
    usePriceHistory: (symbol: string) => {
      return data.priceHistory[symbol] ?? [];
    },
    useTrades: () => {
      return data.trades;
    },
    useNewTradeIds: () => {
      return data.newTradeIds ?? new Set<number>();
    },
    useActivity: () => {
      return data.activity ?? [];
    },
    useAnalytics: () => {
      return data.analytics;
    },
    useRfqs: () => {
      return data.rfqs;
    },
    useQuotesForRfq: (rfqId: number) => {
      return data.quotesForRfq[rfqId] ?? [];
    },
    useAllQuotes: () => {
      return data.allQuotes;
    },
    useCurrencyPairs: () => {
      return data.currencyPairs;
    },
    useInstruments: () => {
      return data.instruments;
    },
    useDealers: () => {
      return data.dealers;
    },
    useConnectionStatus: () => {
      return data.connectionStatus;
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
        state: data.tileExecution[pair.symbol] ?? { status: "ready" },
        execute: noop,
        dismiss: noop,
      };
    },
    useRfqTile: (pair: CurrencyPair) => {
      return {
        state: data.rfqTile[pair.symbol] ?? {
          status: "init",
          quote: null,
          remainingMs: 0,
        },
        requestQuote: noop,
        cancel: noop,
        reject: noop,
        accept: noop,
      };
    },
    // Submission machines: static snapshots for screenshots; intents are no-ops.
    useRfqSubmission: () => {
      return {
        state: data.rfqSubmission ?? { status: "editing" },
        submit: noop,
      };
    },
    useTicketSubmission: () => {
      return {
        state: data.ticketSubmission ?? { submitted: false },
        submitPrice: noop,
        pass: noop,
      };
    },
    // Intent-free derived flags: static snapshot for screenshots.
    useStaleFlag: (pair: CurrencyPair) => {
      return data.stale[pair.symbol] ?? false;
    },
    useAnalyticsStaleFlag: () => {
      return data.analyticsStale ?? false;
    },
    // New-row highlight: deterministic — the highlight tracks isNew instantly (no
    // timer), so the highlighted (isNew) branch is snapshotted with no waiting.
    useRowHighlight: (isNew: boolean) => {
      return isNew;
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
        state: {
          displayValue,
          numericValue: override?.numericValue ?? defaultNotional,
          error: override?.error ?? null,
          isRfq: override?.isRfq ?? false,
          isDefault: override?.isDefault ?? true,
        },
        change: noop,
        reset: noop,
      };
    },
    // Throughput: static snapshot for screenshots; setValue is a no-op. Defaults
    // to a loaded value of 100 (loading:false) so the slider renders.
    useThroughput: () => {
      return {
        value: data.throughput?.value ?? 100,
        loading: data.throughput?.loading ?? false,
        message: data.throughput?.message ?? null,
        setValue: noop,
      };
    },
    // Display preferences: static snapshots for screenshots; the cycle is a
    // no-op. `data.themeMode` is the stored PREFERENCE (dark | light | system);
    // "system" resolves deterministically to dark for the snapshot.
    useThemePreference: () => {
      const modePreference = data.themeMode ?? DEFAULT_THEME_MODE_PREFERENCE;
      return {
        mode: resolveThemeMode(modePreference, true),
        modePreference,
        cycle: noop,
      };
    },
    useThemeSkinPreference: () => {
      return {
        skin: data.themeSkin ?? DEFAULT_THEME_SKIN_FOR_FIXTURES,
        setSkin: noop,
      };
    },
    useAnimatedBackground: () => {
      return {
        enabled: data.animatedBackground ?? false,
        setEnabled: noop,
        toggle: noop,
      };
    },
    usePowerSaver: () => {
      const level = data.powerSaverLevel ?? "off";
      return {
        level,
        isCalm: level !== "off",
        isFreeze: level === "freeze",
        setLevel: noop,
        cycle: noop,
      };
    },
    useAmbientStyle: () => {
      return {
        style: data.ambientStyle ?? DEFAULT_AMBIENT_STYLE_FOR_FIXTURES,
        setStyle: noop,
      };
    },
    useForceBootAnimation: () => {
      return {
        enabled: data.forceBootAnimation ?? DEFAULT_FORCE_BOOT_ANIMATION,
        setEnabled: noop,
        toggle: noop,
      };
    },
    useLoginWaitPreferences: () => {
      return {
        style: DEFAULT_LOGIN_WAIT_STYLE,
        setStyle: noop,
        delay: DEFAULT_LOGIN_WAIT_DELAY,
        setDelay: noop,
      };
    },
    useViewModePreference: () => {
      return {
        viewMode: data.viewMode ?? DEFAULT_VIEW_MODE,
        setViewMode: noop,
      };
    },
    useCreditRfqFilterPreference: () => {
      return {
        filter: data.creditRfqFilter ?? DEFAULT_CREDIT_RFQ_FILTER,
        setFilter: noop,
      };
    },
    useEqWatchlistSort: () => {
      return {
        sort: data.eqWatchlistSort ?? DEFAULT_EQ_WATCHLIST_SORT,
        setSort: noop,
        cycle: noop,
      };
    },
    useEqBlotterView: () => {
      return {
        view: data.eqBlotterView ?? DEFAULT_EQ_BLOTTER_VIEW,
        setView: noop,
      };
    },
    // Auth: static snapshot for screenshots. Defaults to authenticated +
    // unlocked + not authenticating, so the LockScreen overlay renders
    // nothing and existing goldens are unchanged. sessionAuthenticating/
    // waitVariant drive the login/lock-wait scenarios (see fixtures.ts).
    useAuth: () => {
      return {
        state: {
          status: data.sessionAuthenticating
            ? "authenticating"
            : "authenticated",
          user: DEMO_USER,
          locked: data.sessionLocked ?? false,
          unlocking: data.sessionUnlocking ?? false,
          error: null,
          waitVariant: data.waitVariant ?? "handshake",
        },
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
      return { visible: false, reboot: noop, dismiss: noop };
    },
    // Countdown: static snapshot for visual goldens — returns totalMs so the bar
    // renders at 100% fill (deterministic; never wall-clock-dependent).
    useRfqCountdown: (_creationTimestamp: number, totalMs: number) => {
      return totalMs;
    },
    // Animation intents: static screenshots never fire intents, so the bar
    // renders in its neutral, un-animated state.
    useAnimationIntents: (_target: string) => {
      return null;
    },
    // Workspace nav (Task 10): a REAL local useState, not a static filler —
    // the "app/equities" visual scenario clicks the "tab-equities" NavTab
    // and relies on App.tsx's `key={activeTab}` remount to reveal the
    // equities dock, so switchTab must actually re-render App with the new
    // tab (mirroring the App.tsx useState<WorkspaceTab> this replaced).
    useWorkspaceNav: () => {
      const [activeTab, setActiveTab] = useState<WorkspaceTab>("fx");
      return {
        state: { activeTab },
        switchTab: (tab: WorkspaceTab) => {
          setActiveTab(tab);
        },
      };
    },
    // Layout: static snapshot for screenshots — returns the tab's default
    // arrangement with noop intents (no drag, no maximize during capture).
    useLayout: (tab: WorkspaceTab) => {
      return {
        state: dockedLayoutStateFor(tab, dockedPanelIdsIn(data)),
        maximize: noop,
        restore: noop,
        collapse: noop,
        expand: noop,
        resize: noop,
        insertPanel: noop,
        removePanel: noop,
        reset: noop,
      };
    },
    // Reset workspace layout (Preferences → DATA & PRIVACY): static
    // screenshots never fire it.
    useWorkspaceReset: () => {
      return noop;
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
      return { state, skip: noop };
    },
    // Equities: data-driven fakes reading from the AppData equities fields.
    // Fixtures that don't set these fields return the same empty defaults as
    // the old no-op stubs, so all pre-equities goldens stay pixel-identical.
    useWatchlist: () => {
      return data.equityWatchlist ?? [];
    },
    useEquityQuote: (symbol: string) => {
      return data.equityQuotes?.[symbol] ?? null;
    },
    useCandles: (symbol: string) => {
      return data.equityCandles?.[symbol] ?? [];
    },
    // Candle backfill: static screenshots never trigger a near-edge load, so
    // both flags stay at their default false — no AppData field backs this
    // (no fixture needs a non-default value; ChartBackfill's visual scenarios
    // drive CandleChart's props directly, bypassing the ViewModel).
    useCandleBackfill: () => {
      return { loadingOlder: false, historyExhausted: false };
    },
    loadOlderCandles: noop,
    // No visual fixture exercises the canvas substrate yet (Task 6 owns the
    // pixel tier) — a fixed "dom" default keeps every existing golden's
    // geometry layer unchanged.
    useChartSubstrate: () => {
      return { substrate: DEFAULT_CHART_SUBSTRATE, setSubstrate: noop };
    },
    // No visual fixture exercises the dockview engine yet — a fixed
    // "inhouse" default keeps every existing golden's layout unchanged.
    useLayoutEngine: () => {
      return { engine: DEFAULT_LAYOUT_ENGINE, setEngine: noop };
    },
    useDockLayoutStore: () => {
      return dockStore;
    },
    useDepth: (symbol: string) => {
      return data.equityDepth?.[symbol] ?? null;
    },
    useEquityOrders: () => {
      return data.equityOrders ?? [];
    },
    useEquityPositions: () => {
      return data.equityPositions ?? [];
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
        state,
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
      return (
        data.adminMetrics ?? { throughput: [], latency: [], errorRate: [] }
      );
    },
    useTopology: () => {
      return data.adminTopology ?? null;
    },
    useEventLog: () => {
      return data.adminEventLog ?? [];
    },
    useSessions: () => {
      return data.adminSessions ?? [];
    },
    useSessionCountSeries: () => {
      return data.adminSessionCountSeries ?? [];
    },
    useIncident: () => {
      return {
        state: data.adminIncident ?? { active: [] },
        inject: noop,
        clear: noop,
      };
    },
    // Eq workspace: static snapshot for screenshots; intents are no-ops (no
    // tab switch/close/timeframe change during capture).
    useEqWorkspace: () => {
      return {
        state: data.equityWorkspace ?? {
          sel: "",
          openTabs: [],
          timeframe: "1D",
          chartType: "candles",
          indicators: [],
          panes: [],
          yScale: "linear",
          compare: null,
        },
        select: noop,
        closeTab: noop,
        setTimeframe: noop,
        setChartType: noop,
        toggleIndicator: noop,
        togglePane: noop,
        toggleYScale: noop,
        setCompare: noop,
      };
    },
    // Eq drawings: the equities/chart-drawings visual scenario feeds literal
    // `drawings`/`selectedDrawingId` props directly to CandleChart (see
    // EquitiesChartDrawings) and never reads this fake — a static empty
    // snapshot; intents are no-ops.
    useEqDrawings: () => {
      return {
        state: { tool: "cursor", drawings: {}, selectedId: null },
        setTool: noop,
        addDrawing: noop,
        selectDrawing: noop,
        deleteSelected: noop,
        shiftAnchors: noop,
        updateDrawing: noop,
      };
    },
    // Jarvis: data-driven fake for JarvisOrb/JarvisOverlay screenshots — a
    // static state snapshot (Task 10); all intents stay no-ops (static
    // screenshots never fire them). Fixtures that don't set `jarvis` fall
    // back to the same closed/idle/empty-entries default the pre-Task-10
    // stub returned (see DEFAULT_JARVIS_STATE_FOR_FIXTURES above).
    useJarvis: () => {
      return {
        state: data.jarvis ?? DEFAULT_JARVIS_STATE_FOR_FIXTURES,
        open: noop,
        close: noop,
        toggle: noop,
        send: noop,
        narrate: noop,
        sendScripted: noop,
        approveConfirmation: noop,
        declineConfirmation: noop,
        setSkin: noop,
      };
    },
    // No jarvis-preference AppData field yet (Task 10) — static defaults
    // matching JarvisMachine's own INITIAL/DEFAULT_JARVIS_EFFORT; no-op
    // setters (static screenshots never fire them).
    useJarvisPreferences: () => {
      return {
        brain: "scripted",
        setBrain: noop,
        effort: "medium",
        setEffort: noop,
        narrator: "on",
        setNarrator: noop,
      };
    },
    // Jarvis token-usage/cost telemetry (Task 10) — data-driven off
    // AppData.jarvisUsage; fixtures that don't set it fall back to null (the
    // card's "NO USAGE DATA" placeholder), pixel-neutral for every existing
    // golden that never mounts JarvisUsageCard.
    useJarvisUsage: () => {
      return data.jarvisUsage ?? null;
    },
    // Generative-UI desk panels (Task 10 of this round) — data-driven off
    // AppData.jarvisPanels; fixtures that don't set it fall back to the
    // pre-Task-10-of-this-round empty stub (layer renders null). `data$` is
    // never read by JarvisPanelLayer (it reads the panel body separately via
    // useJarvisPanelData below), so EMPTY is a safe filler satisfying
    // JarvisPanelVm's shape without a real stream. dismissPanel/dockPanel/
    // undockPanel all stay no-ops — static screenshots never fire them.
    // dockedPanels/floatingPanels are the same rows pre-split by `.docked`,
    // mirroring JarvisPanelsPresenter.dockedPanels$/floatingPanels$.
    useJarvisPanels: () => {
      const panels: readonly JarvisPanelVm[] = (data.jarvisPanels ?? []).map(
        (panel) => {
          return { ...panel, data$: EMPTY, docked: panel.docked ?? false };
        },
      );
      return {
        panels,
        dockedPanels: panels.filter((panel) => {
          return panel.docked;
        }),
        floatingPanels: panels.filter((panel) => {
          return !panel.docked;
        }),
        dismissPanel: noop,
        dockPanel: noop,
        undockPanel: noop,
      };
    },
    // Per-panelId rendered body, paired with useJarvisPanels above — reads
    // AppData.jarvisPanelData directly (no stream involved in a static
    // screenshot); a missing key returns null, same as the real VM before
    // the panel's first data frame.
    useJarvisPanelData: (panelId: string) => {
      return data.jarvisPanelData?.[panelId] ?? null;
    },
    // Jarvis drive-the-app interpreter's outcomes (Task 10) — static empty
    // filler: no fixture drives a batch through a visual screenshot, so the
    // driven-pulse cue never fires here (pixel-neutral for every golden).
    useJarvisDriver: (): JarvisDriverState => {
      return { lastBatch: [] };
    },
    // Jarvis hands-free scripted demo — static idle filler, no-op intents
    // (Task 6/7 of this round wire up a consuming UI; no static screenshot
    // drives it yet, so this stays pixel-neutral for every existing golden).
    useJarvisDemo: () => {
      const state: JarvisDemoState = {
        running: false,
        stepIndex: 0,
        stepCount: JARVIS_DEMO_STEPS.length,
        label: null,
      };
      return { state, startDemo: noop, stopDemo: noop };
    },
  };
}

/** The tab's default arrangement, plus a docked leaf for every desk panel the
 * fixture marks `docked: true` (GenUI L3). Built by driving the REAL
 * `createLayoutMachine`'s `insertPanel` intent over the tab's DEFAULT port —
 * the same code path `Presenters.dockPanel` runs in the app — rather than
 * hand-writing a dock-column tree literal that would drift the moment
 * `insertDockedLeaf` changed. The machine is warm, so its post-insert state is
 * readable synchronously.
 *
 * No tab attribution: the fixture format has none, and a static screenshot
 * frames exactly one tab, so a docked panel is inserted into whichever tab is
 * asked for. Result is memoized per (tab, ids) because `useLayout` is read on
 * every render.
 */
function dockedLayoutStateFor(
  tab: WorkspaceTab,
  dockedPanelIds: readonly string[],
): LayoutState {
  const port = createDefaultLayoutPort(tab);

  if (dockedPanelIds.length === 0) {
    return port.initial;
  }

  const key = `${tab}|${dockedPanelIds.join(",")}`;
  const cached = dockedLayoutStates.get(key);

  if (cached) {
    return cached;
  }

  const machine = createLayoutMachine(port);

  for (const panelId of dockedPanelIds) {
    machine.intents.insertPanel(panelId);
  }

  let built = port.initial;
  machine.state$
    .subscribe((layoutState) => {
      built = layoutState;
    })
    .unsubscribe();
  machine.dispose();
  dockedLayoutStates.set(key, built);
  return built;
}

const dockedLayoutStates = new Map<string, LayoutState>();

/** The fixture's docked desk-panel ids, in order. */
function dockedPanelIdsIn(data: AppData): readonly string[] {
  return (data.jarvisPanels ?? [])
    .filter((panel) => {
      return panel.docked === true;
    })
    .map((panel) => {
      return panel.panelId;
    });
}
