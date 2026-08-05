import { EMPTY, type Observable, of, Subject } from "rxjs";
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  take,
} from "rxjs/operators";

import type {
  BootVariant,
  ConnectionEvent,
  CurrencyPair,
  EquityInstrument,
  ExecuteTradeInput,
  JarvisSkin,
  LoginWaitVariant,
  PowerSaverLevel,
  ThemeSkin,
} from "@rtc/domain";
import {
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_LOGIN_WAIT_VARIANT,
  LOGIN_WAIT_DELAY_MS,
} from "@rtc/domain";
import type { JarvisHistoryEntry } from "@rtc/shared";

import { withLoginDelay } from "#/adapters/delayedAuthPort";
import type { IWsAdapter } from "#/adapters/IWsAdapter";
import type { AppPorts, AuthGatedTransport } from "#/adapters/portFactory";
import { WsJarvisAdapter } from "#/adapters/WsJarvisAdapter";
import {
  createDefaultLayoutPort,
  type WorkspaceTab,
} from "#/layout/defaultLayoutPort";
import type { LayoutNode } from "#/layout/layoutPort";
import {
  AmbientStylePresenter,
  AnalyticsPresenter,
  AnimatedBackgroundPresenter,
  AnimationDirector,
  AuthPresenter,
  BlotterPresenter,
  BootGatePresenter,
  BootPreferencePresenter,
  CandleSeriesPresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  createBootSequenceMachine,
  createEqWorkspaceMachine,
  createIncidentMachine,
  createJarvisDriverMachine,
  createJarvisMachine,
  createJarvisPanelsMachine,
  createLayoutMachine,
  createNotionalMachine,
  createOrderTicketMachine,
  createRfqTileMachine,
  createRowHighlightMachine,
  createStaleFlagMachine,
  createTileExecutionMachine,
  createWorkspaceNavMachine,
  DealersPresenter,
  DepthPresenter,
  EqBlotterViewPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
  type EqWorkspaceIntents,
  type EqWorkspaceState,
  ErrorRatePresenter,
  EventLogPresenter,
  ForceBootAnimationPresenter,
  type IncidentIntents,
  type IncidentState,
  InstrumentsPresenter,
  type JarvisDriverMachineHandle,
  type JarvisEntry,
  type JarvisMachineHandle,
  JarvisPanelsPresenter,
  JarvisPreferencesPresenter,
  JarvisUsagePresenter,
  LatencyPresenter,
  LoginWaitPreferencesPresenter,
  type Machine,
  type MachineFactories,
  OrdersBlotterPresenter,
  PositionsPresenter,
  PowerSaverPresenter,
  PriceHistoryPresenter,
  PriceStreamPresenter,
  RfqQuotePresenter,
  RfqsPresenter,
  ServiceTopologyPresenter,
  SessionsKpiPresenter,
  SessionsPresenter,
  ThemePreferencePresenter,
  ThemeSkinPreferencePresenter,
  ThroughputMetricPresenter,
  ThroughputPresenter,
  TradeExecutionPresenter,
  ViewModePreferencePresenter,
  WatchlistPresenter,
  type WorkspaceNavIntents,
  type WorkspaceNavState,
} from "#/presenters/index";

export type { AppPorts };

/** The reconnect-intent event emitted from the Reconnect button. */
interface ReconnectIntent {
  type: "reconnect";
}

/** Routes idle-lifecycle events to the WS adapter. Exported so the wiring is
 * directly testable (idleTeardown.test.ts).
 * - idleTimeout  → closeForIdle() (suppresses auto-reconnect)
 * - reconnect    → reopen()       (sole recovery from idle; button-only)
 * - userActivity → no-op here     (resets countdown in BrowserConnectionEventsAdapter
 *                                   only; does NOT reopen the socket)
 * Provenance: original services/connection.ts:74-96. */
export function routeIdleLifecycle(
  event: ConnectionEvent,
  ws: Pick<IWsAdapter, "closeForIdle" | "reopen">,
): void {
  if (event.type === "idleTimeout") {
    ws.closeForIdle();
  } else if (event.type === "reconnect") {
    ws.reopen();
  }
}

export interface Presenters {
  priceStream: PriceStreamPresenter;
  priceHistory: PriceHistoryPresenter;
  execution: TradeExecutionPresenter;
  blotter: BlotterPresenter;
  analytics: AnalyticsPresenter;
  rfqs: RfqsPresenter;
  currencyPairs: CurrencyPairsPresenter;
  instruments: InstrumentsPresenter;
  dealers: DealersPresenter;
  connection: ConnectionStatusPresenter;
  rfqQuote: RfqQuotePresenter;
  throughput: ThroughputPresenter;
  themePreference: ThemePreferencePresenter;
  themeSkinPreference: ThemeSkinPreferencePresenter;
  animatedBackground: AnimatedBackgroundPresenter;
  ambientStyle: AmbientStylePresenter;
  forceBootAnimation: ForceBootAnimationPresenter;
  powerSaver: PowerSaverPresenter;
  viewModePreference: ViewModePreferencePresenter;
  creditRfqFilterPreference: CreditRfqFilterPreferencePresenter;
  /** Equities watchlist sort-mode preference (the head's ⇅ cycle control). */
  eqWatchlistSortPreference: EqWatchlistSortPreferencePresenter;
  /** Equities blotter tab preference (Orders/Positions), consumed by Task 5. */
  eqBlotterViewPreference: EqBlotterViewPreferencePresenter;
  animationDirector: AnimationDirector;
  bootPreference: BootPreferencePresenter;
  /** Boot-splash overlay visibility + the account menu's ⟳ Reboot HUD intent. */
  bootGate: BootGatePresenter;
  auth: AuthPresenter;
  /** The two login-wait inspection preferences (style pin + artificial delay). */
  loginWaitPreferences: LoginWaitPreferencesPresenter;
  /** The two Jarvis desk-assistant preferences (brain + thinking-effort budget). */
  jarvisPreferences: JarvisPreferencesPresenter;
  watchlist: WatchlistPresenter;
  candleSeries: CandleSeriesPresenter;
  depth: DepthPresenter;
  ordersBlotter: OrdersBlotterPresenter;
  positions: PositionsPresenter;
  /** Phase 5 Admin: incident injection + connection-seam control. */
  incident: Machine<IncidentState, IncidentIntents>;
  /** Equities: cross-panel selected-symbol / open-tabs / timeframe state,
   * shared by the chart, instrument-tabs, and watchlist panels. */
  eqWorkspace: Machine<EqWorkspaceState, EqWorkspaceIntents>;
  /** The app's active workspace tab — a composition-root singleton (mirrors
   * `eqWorkspace`/`incident` above), the promoted form of the
   * `useState<WorkspaceTab>` that used to live directly in each web client's
   * `App.tsx`, now reachable from composition (and therefore from Jarvis's
   * drive-the-app `switchTab` command — see the P5 `JarvisDriverMachine`,
   * composed alongside `jarvisPanels` below). */
  workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;
  /** Phase 5 Admin: per-metric rolling window series for charts. */
  throughputMetric: ThroughputMetricPresenter;
  latencyMetric: LatencyPresenter;
  errorRateMetric: ErrorRatePresenter;
  /** Phase 5 Admin: service-topology graph stream. */
  topology: ServiceTopologyPresenter;
  /** Phase 5 Admin: newest-first rolling event log. */
  eventLog: EventLogPresenter;
  /** Phase 5 Admin: active trader sessions feed. */
  sessions: SessionsPresenter;
  /** Plan E Admin: rolling session-count series for the "Active Sessions" KPI card. */
  sessionsKpi: SessionsKpiPresenter;
  /** J.A.R.V.I.S. chat overlay: entries, skin, pending confirmation, phase.
   * Widened with `events$` (every turn's reply events) — Task 6's
   * `jarvisPanels` below is composed from it. */
  jarvis: JarvisMachineHandle;
  /** J.A.R.V.I.S. usage/cost telemetry (Admin surface) — null until the
   * first snapshot. */
  jarvisUsage: JarvisUsagePresenter;
  /** J.A.R.V.I.S. generative-UI desk panels: spawned/edited/dismissed via
   * `jarvis`'s own "panel" turn events, interpreted into live `PanelData`
   * over the domain ports. */
  jarvisPanels: JarvisPanelsPresenter;
  /** J.A.R.V.I.S. drive-the-app interpreter: turns `jarvis`'s own "command"
   * turn events into staggered intent dispatches on `workspaceNav`,
   * per-tab layout machines, `eqWorkspace`, the theme-skin/power-saver
   * preferences, and `jarvisPanels.dismissPanel` — see
   * `JarvisDriverMachine`'s doc for the total-interpreter/choreography
   * contract. */
  jarvisDriver: JarvisDriverMachineHandle;
}

export interface AppCommands {
  /** Push a user-initiated reconnect intent (wired to reconnect$ in composition). */
  reconnect(): void;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
  commands: AppCommands;
}

/**
 * Phase-0 shared seam — owned by the neutral core.
 * User-initiated reconnect intent Subject. Owned in composition so both the
 * real-WS and simulator branches can merge it, and the hook factory can push
 * into it via AppCommands.reconnect().
 * `buildBrowserPorts` (client-react) imports and merges these into connectionEvents.
 */
export const reconnect$ = new Subject<ReconnectIntent>();

/**
 * Phase-0 shared seam — owned by the neutral core.
 * Incident-machine connection-event sink. Plain Subject — a live sink for
 * inject() calls. Owned at module level alongside reconnect$.
 * `buildBrowserPorts` (client-react) imports and merges these into connectionEvents.
 */
export const incident$ = new Subject<ConnectionEvent>();

/**
 * Reads the current value of a replay-current preference stream synchronously.
 *
 * Every PreferencesPort adapter is BehaviorSubject-backed, so the value lands
 * before `.subscribe()` returns. The `fallback` guards a hypothetical
 * non-replaying implementation: without it the caller would see `undefined`,
 * and for the login-wait cycle that meant `LOGIN_WAIT_VARIANTS.indexOf(undefined)`
 * → -1 and a wait treatment that silently failed to render — precisely the
 * no-feedback state these preferences exist to fix.
 */
function readPreferenceNow<T>(source$: Observable<T>, fallback: T): T {
  let value: T | undefined;
  const sub = source$.pipe(take(1)).subscribe((v) => {
    value = v;
  });
  sub.unsubscribe();
  return value ?? fallback;
}

/** One-shot synchronous peek at the watchlist's first symbol, used only to
 * seed EqWorkspaceMachine's initial tab/selection at composition time. The
 * simulator port's `watchlist()` is `of(WATCHLIST)` — it emits synchronously,
 * so this reliably captures "AAPL" (or whatever heads the catalogue) before
 * `createApp` returns. A real WS backend's `watchlist()` arrives over the
 * wire (not synchronously) — this peek then finds nothing and falls back to
 * "", the same empty-selection state the eq-* dock panels' own
 * `instruments[0]?.symbol ?? ""` guards tolerate before the watchlist has
 * loaded. The peek subscribes and
 * immediately unsubscribes; `watchlist$`'s `shareReplay({refCount: true})`
 * tears down and restarts cleanly for whichever component subscribes next. */
function peekFirstWatchlistSymbol(
  watchlist$: Observable<readonly EquityInstrument[]>,
): string {
  let first = "";
  const sub = watchlist$.subscribe((list) => {
    if (first === "" && list.length > 0) {
      first = list[0]?.symbol ?? "";
    }
  });
  sub.unsubscribe();
  return first;
}

/** Async companion to {@link peekFirstWatchlistSymbol}: resolves the SAME
 * first-watchlist-symbol, but as an Observable that waits for it to actually
 * arrive instead of only checking what's already buffered. Passed to
 * EqWorkspaceMachine as `seed$` so a WS-real backend (whose watchlist() lands
 * over the wire, not synchronously) can recover from the peek's "" fallback:
 * once the watchlist's first non-empty list arrives, this emits its first
 * symbol exactly once and completes. A no-op when the sync peek already
 * found a symbol — the machine only applies a seed while sel is still "". */
export function firstWatchlistSymbol$(
  watchlist$: Observable<readonly EquityInstrument[]>,
): Observable<string> {
  return watchlist$.pipe(
    map((list) => {
      return list[0]?.symbol ?? "";
    }),
    filter((symbol) => {
      return symbol !== "";
    }),
    take(1),
  );
}

/** Every `PanelId` reachable in one layout tree, walked from its root — a
 * `"panel"` leaf contributes its own id, a `"split"` node contributes its
 * children's. Pure and static (the default trees never change at runtime),
 * so `LAYOUT_PANEL_IDS` below computes this once per tab at module load
 * rather than per `JarvisDriverMachine` call. */
function collectPanelIds(node: LayoutNode): readonly string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "equities",
  "admin",
];

/** `JarvisDriverMachine`'s `knownLayoutPanelIds` dep source: the static panel
 * ids in each tab's DEFAULT layout tree (e.g. "fx-rates", "eq-chart") — the
 * `"layout"` DriveCommand's membership check. Deliberately the tree's
 * default shape, not whatever a live per-mount layout machine's current
 * `root` happens to be (panel ids never move between tabs at runtime, so the
 * default tree's id set is exactly the live set too). */
const LAYOUT_PANEL_IDS: Readonly<Record<WorkspaceTab, readonly string[]>> =
  Object.fromEntries(
    WORKSPACE_TABS.map((tab) => {
      return [tab, collectPanelIds(createDefaultLayoutPort(tab).initial.root)];
    }),
  ) as Readonly<Record<WorkspaceTab, readonly string[]>>;

/**
 * Defensive guard, currently UNREACHABLE in production — kept so a natural
 * future refactor doesn't silently reintroduce a double-send bug. Read
 * `wireJarvisHistorySource`'s doc first for why `ask()`'s `historySource()`
 * read is EAGER (runs before `JarvisMachine`'s "start" patch ever appends the
 * new turn's own `[userEntry, jarvisEntry stub]` pair to `state.entries`), so
 * in today's call shape this function's `slice` branch never actually fires:
 * proven by the direct unit test next to this function in
 * `composition.jarvisHistory.test.ts`, which is the ONLY thing currently
 * exercising it (mutate this function and that test goes red; nothing else
 * would notice).
 *
 * Why keep it: `ask()`'s eager read is an incidental consequence of today's
 * call shape, not a documented contract of `WsJarvisAdapter` — wrapping
 * `ask()`'s body in `defer(() => …)` (so `historySource()` is read at
 * SUBSCRIBE time instead, matching how `createJarvisTurnStream` already
 * defers its `ws.send()`) is a natural-looking refactor that would flip the
 * ordering and make this exclusion load-bearing: a history snapshot read at
 * that later point WOULD contain the in-flight turn's own pair, and
 * `WsJarvisAdapter.ask()` already sends that same text separately as
 * `JarvisChatPayload.text` — so echoing it back inside `history` too would
 * hand the model its own newest message twice. Cheaper to keep a guard that
 * costs one array slice per turn than to silently reintroduce that bug the
 * day someone makes `ask()` lazy.
 */
export function historyEntriesExcludingInFlightTurn(
  entries: readonly JarvisEntry[],
): readonly JarvisEntry[] {
  const last = entries[entries.length - 1];
  return last && !last.done ? entries.slice(0, -2) : entries;
}

/**
 * Threads `presenters.jarvis`'s own state back into `ports.jarvis` as its
 * chat-history replay source — only when `ports.jarvis` is a
 * `WsJarvisAdapter` (WS-real mode; `jarvisPort.ts`'s surface stays unchanged,
 * so this is an instanceof check rather than a port-interface method).
 * Simulator mode's `ScriptedJarvisAdapter` has no `setHistorySource` and
 * needs none — its brain already runs against the live application state
 * directly, with no wire history to replay.
 *
 * Late-bound rather than constructor-injected: `JarvisMachine` (built here,
 * in `createApp`) is constructed FROM `ports.jarvis`, so the machine's state
 * can't reach the adapter at port-factory time without a cycle. `state$` has
 * no synchronous `getValue()` in its public `Machine` typing (it's declared
 * as the un-defaulted `StateObservable`, whose `getValue()` types as
 * `T | StatePromise<T>`), so this subscribes once here instead.
 *
 * The subscribe callback only CACHES the raw `entries` reference (O(1)) — it
 * does NOT filter/map on every emission. `state$` re-emits on every delta,
 * toolEvent, and confirmation-countdown tick, and this is a permanently
 * animated HUD (see `docs/performance.md`); doing the filter+map work there
 * would repeat O(entries) work on every one of those ticks for a value only
 * ever read once per `ask()` call. Instead the filter+map is pushed inside
 * the `setHistorySource` closure itself, so it runs exactly once per turn —
 * the only time it's actually needed.
 *
 * `ask()` reads `historySource()` EAGERLY at CALL time (see
 * `historyEntriesExcludingInFlightTurn`'s doc) — before `JarvisMachine`'s
 * "start" patch (also driven off this same `state$`) has appended the new
 * turn's own pair — so the cached `entries` snapshot never includes the
 * in-flight turn's own message in practice.
 *
 * The subscription this creates would otherwise permanently pin `state$`'s
 * refCount above zero even after `presenters.jarvis.dispose()` unsubscribes
 * its own internal `warm` subscriber (`state()`'s doc: "the shared
 * subscription is closed as soon as there are no subscribers"), silently
 * defeating `dispose()` in WS-real mode. So `dispose` is wrapped here to also
 * unsubscribe this one — the only "permanent" subscription this function
 * owns, torn down through the one disposal path that exists for this
 * machine (there is no separate app-level disposal hook to join instead).
 */
function wireJarvisHistorySource(
  jarvisPort: AppPorts["jarvis"],
  jarvisMachine: Presenters["jarvis"],
): void {
  if (!(jarvisPort instanceof WsJarvisAdapter)) {
    return;
  }

  let latestEntries: readonly JarvisEntry[] = [];

  const subscription = jarvisMachine.state$.subscribe((state) => {
    latestEntries = state.entries;
  });

  jarvisPort.setHistorySource(() => {
    return historyEntriesExcludingInFlightTurn(latestEntries)
      .filter((entry) => {
        return entry.done && entry.text.length > 0;
      })
      .map((entry): JarvisHistoryEntry => {
        return { role: entry.role, text: entry.text };
      });
  });

  const disposeMachine = jarvisMachine.dispose;

  jarvisMachine.dispose = (): void => {
    subscription.unsubscribe();
    disposeMachine();
  };
}

export function createApp(ports: AppPorts): App {
  // Hoisted so the AnimationDirector can wire its connectionStatus$ source from
  // the same connection presenter instance the rest of the app consumes.
  const connection = new ConnectionStatusPresenter(ports.connectionEvents);
  // Hoisted so priceStream/priceHistory can gate their conflation behind the
  // same power-saver flag stream the record also exposes as `powerSaver`.
  const powerSaver = new PowerSaverPresenter(ports.preferences);
  // Hoisted so the AnimationDirector can consume their streams directly.
  const priceStream = new PriceStreamPresenter(
    ports.pricing,
    powerSaver.isCalm$,
  );
  const execution = new TradeExecutionPresenter(ports.execution);
  const rfqs = new RfqsPresenter(ports.workflow);
  const currencyPairs = new CurrencyPairsPresenter(ports.referenceData);
  // Hoisted so the AnimationDirector can consume its fills$ stream for ticket
  // fill-flash choreography (Phase 4 equities).
  const ordersBlotter = new OrdersBlotterPresenter(ports.orders);
  // Hoisted so eqWorkspace can seed its initial selection from the first
  // watchlist symbol (see peekFirstWatchlistSymbol below).
  const watchlist = new WatchlistPresenter(ports.marketData);

  // Hoisted (rather than built inline in the `presenters` literal below,
  // where it used to live) so JarvisDriverMachine — composed below, beside
  // jarvisPanels — can target this singleton's intents from "eqSelect"/
  // "eqTimeframe"/"eqChartType"/"eqIndicator"/"eqPane" DriveCommands. Only
  // needs `watchlist`, already built above.
  const eqWorkspace = createEqWorkspaceMachine({
    initialSymbol: peekFirstWatchlistSymbol(watchlist.watchlist$),
    seed$: firstWatchlistSymbol$(watchlist.watchlist$),
  });

  // Hoisted (rather than built inline in the `presenters` literal below,
  // where it used to live) so JarvisDriverMachine's `setThemeSkin` closure
  // can call `.setSkin` on the SAME instance the `presenters` literal below
  // exposes — one preference presenter, not two independent ones racing the
  // same underlying preferences port.
  const themeSkinPreference = new ThemeSkinPreferencePresenter(
    ports.preferences,
  );

  // Hoisted (rather than built inline in the `presenters` literal below) so
  // `jarvisPanels` can be composed from `jarvis.events$` — Task 6's sole
  // event source for the generative-UI panels machine (see
  // JarvisMachineHandle's doc). The `catchError`/`EMPTY` guard is required:
  // `createJarvisPanelsMachine`'s `events$` input is TERMINAL on error
  // (kills its fold + reports unhandled), and nothing about `jarvis.events$`
  // itself rules that out.
  const jarvis = createJarvisMachine({
    port: ports.jarvis,
    skin$: ports.preferences.jarvisSkin$(),
    setSkin: (s: JarvisSkin): void => {
      ports.preferences.setJarvisSkin(s);
    },
    // Only WsJarvisAdapter (WS-real mode) exposes availability$ — see
    // wireJarvisHistorySource's doc above for why this is an instanceof
    // check rather than a JarvisPort method (jarvisPort.ts's surface stays
    // unchanged). Simulator mode's ScriptedJarvisAdapter has none and
    // needs none: createJarvisMachine defaults an absent availability$ to
    // an always-available, scripted-only value, so sim stays permanently
    // available offering only the scripted brain.
    availability$:
      ports.jarvis instanceof WsJarvisAdapter
        ? ports.jarvis.availability$()
        : undefined,
    preferredBrain$: ports.preferences.jarvisBrain$(),
    effort$: ports.preferences.jarvisEffort$(),
  });

  const jarvisPanels = new JarvisPanelsPresenter(
    createJarvisPanelsMachine(
      jarvis.events$.pipe(
        catchError(() => {
          return EMPTY;
        }),
      ),
    ),
    {
      referenceData: ports.referenceData,
      pricing: ports.pricing,
      blotter: ports.blotter,
      analytics: ports.analytics,
    },
  );

  // Hoisted (rather than built inline in the `presenters` literal below,
  // unlike eqWorkspace) so JarvisDriverMachine — composed here beside
  // jarvisPanels, same scope — can target this singleton's switchTab intent
  // from a "switchTab" DriveCommand. Takes no deps, unlike eqWorkspace/
  // incident, so it needs nothing else built first.
  const workspaceNav = createWorkspaceNavMachine();

  // JarvisDriverMachine: the total DriveCommand interpreter (Task 6). SAME
  // catchError/EMPTY guard as jarvisPanels above — createJarvisDriverMachine's
  // events$ input is equally TERMINAL on error, and both fold over the same
  // jarvis.events$ source, so a source error must not kill either fold.
  // `layout` is passed straight through as the same per-call factory
  // MachineFactories.layout exposes to the UI (see JarvisDriverDeps.layout's
  // own doc for why this is deliberately NOT a cached singleton — mirrors
  // the workspaceNav dispose-on-unmount lesson from Task 5's review).
  const jarvisDriver = createJarvisDriverMachine({
    events$: jarvis.events$.pipe(
      catchError(() => {
        return EMPTY;
      }),
    ),
    workspaceNav,
    layout: (tab: WorkspaceTab) => {
      return createLayoutMachine(createDefaultLayoutPort(tab));
    },
    eqWorkspace,
    setThemeSkin: (skin: ThemeSkin): void => {
      themeSkinPreference.setSkin(skin);
    },
    setPowerSaver: (level: PowerSaverLevel): void => {
      powerSaver.setLevel(level);
    },
    dismissPanel: (panelId: string): void => {
      jarvisPanels.dismissPanel(panelId);
    },
    knownLayoutPanelIds: (tab: WorkspaceTab) => {
      return LAYOUT_PANEL_IDS[tab];
    },
    knownSymbols$: watchlist.watchlist$.pipe(
      map((list) => {
        return list.map((instrument) => {
          return instrument.symbol;
        });
      }),
    ),
    powerSaverLevel$: powerSaver.level$,
  });

  // Fall back to a light-always scheme when no OS color-scheme source is provided
  // (tests, simulator, environments without matchMedia).
  const colorScheme = ports.colorScheme ?? {
    prefersDark$: (): Observable<boolean> => {
      return of(false);
    },
  };

  const presenters: Presenters = {
    priceStream,
    priceHistory: new PriceHistoryPresenter(ports.pricing, powerSaver.isCalm$),
    execution,
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs,
    currencyPairs,
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection,
    rfqQuote: new RfqQuotePresenter(ports.pricing),
    throughput: new ThroughputPresenter(ports.admin),
    themePreference: new ThemePreferencePresenter(
      ports.preferences,
      colorScheme,
    ),
    themeSkinPreference,
    animatedBackground: new AnimatedBackgroundPresenter(ports.preferences),
    ambientStyle: new AmbientStylePresenter(ports.preferences),
    forceBootAnimation: new ForceBootAnimationPresenter(ports.preferences),
    powerSaver,
    viewModePreference: new ViewModePreferencePresenter(ports.preferences),
    creditRfqFilterPreference: new CreditRfqFilterPreferencePresenter(
      ports.preferences,
    ),
    eqWatchlistSortPreference: new EqWatchlistSortPreferencePresenter(
      ports.preferences,
    ),
    eqBlotterViewPreference: new EqBlotterViewPreferencePresenter(
      ports.preferences,
    ),
    animationDirector: new AnimationDirector({
      pairs$: currencyPairs.pairs$,
      priceFor: (pair: CurrencyPair) => {
        return priceStream.price$(pair);
      },
      connectionStatus$: connection.status$,
      executions$: execution.executions$,
      rfqEvents$: rfqs.events$,
      equityFills$: ordersBlotter.fills$,
    }),
    bootPreference: new BootPreferencePresenter(ports.preferences),
    // Boot-splash visibility, seeded once from the platform's boot-splash
    // decision (defaults to playing when no bootSplash port is supplied).
    bootGate: new BootGatePresenter(ports.bootSplash?.shouldPlay() ?? true),
    // Login/lock/logout lifecycle over the injected AuthPort + SessionStore.
    //
    // The AuthPort is wrapped so the "Login wait delay" preference holds the
    // outcome back; at "off" the wrapper passes through synchronously, so the
    // default path is byte-for-byte today's behaviour.
    //
    // The 4th argument is the login-wait variant cycle, read and advanced
    // through the preferences seam — same pattern as boot's variant. The
    // "Login wait style" pin is resolved HERE rather than inside
    // AuthPresenter: when a concrete style is chosen, `current` returns it and
    // `advance` is a no-op, so the presenter keeps asking one question ("which
    // treatment for this attempt?") and composition decides whether the answer
    // comes from a cycle or from a pin. That also leaves the cycle pointer
    // untouched while pinned, so switching back to "auto" resumes where the
    // user left off instead of somewhere they never chose.
    auth: new AuthPresenter(
      withLoginDelay(ports.auth, () => {
        return LOGIN_WAIT_DELAY_MS[
          readPreferenceNow(
            ports.preferences.loginWaitDelay$(),
            DEFAULT_LOGIN_WAIT_DELAY,
          )
        ];
      }),
      ports.sessionStore,
      undefined,
      {
        current: (): LoginWaitVariant => {
          const style = readPreferenceNow(
            ports.preferences.loginWaitStyle$(),
            DEFAULT_LOGIN_WAIT_STYLE,
          );

          if (style !== "auto") {
            return style;
          }

          return readPreferenceNow(
            ports.preferences.loginWaitVariant$(),
            DEFAULT_LOGIN_WAIT_VARIANT,
          );
        },
        advance: (next: LoginWaitVariant): void => {
          const style = readPreferenceNow(
            ports.preferences.loginWaitStyle$(),
            DEFAULT_LOGIN_WAIT_STYLE,
          );

          if (style !== "auto") {
            return;
          }

          ports.preferences.setLoginWaitVariant(next);
        },
      },
    ),
    loginWaitPreferences: new LoginWaitPreferencesPresenter(ports.preferences),
    jarvisPreferences: new JarvisPreferencesPresenter(ports.preferences),
    watchlist,
    candleSeries: new CandleSeriesPresenter(ports.marketData),
    depth: new DepthPresenter(ports.marketData),
    ordersBlotter,
    positions: new PositionsPresenter(ports.positions),
    incident: createIncidentMachine({
      controls: ports.metricControls,
      pushConnectionEvent: (ev: ConnectionEvent) => {
        return incident$.next(ev);
      },
    }),
    eqWorkspace,
    workspaceNav,
    throughputMetric: new ThroughputMetricPresenter(ports.telemetry),
    latencyMetric: new LatencyPresenter(ports.telemetry),
    errorRateMetric: new ErrorRatePresenter(ports.telemetry),
    topology: new ServiceTopologyPresenter(ports.serviceHealth),
    eventLog: new EventLogPresenter(ports.eventLog),
    sessions: new SessionsPresenter(ports.sessions),
    sessionsKpi: new SessionsKpiPresenter(ports.sessions),
    jarvis,
    jarvisUsage: new JarvisUsagePresenter(ports.jarvisUsage),
    jarvisPanels,
    jarvisDriver,
  };

  wireJarvisHistorySource(ports.jarvis, presenters.jarvis);
  gateTransportOnAuth(ports.transport, presenters.auth);

  const commands: AppCommands = {
    reconnect: () => {
      reconnect$.next({ type: "reconnect" });
    },
  };
  return { presenters, ports, commands };
}

/**
 * Opens the transport only while the user is authenticated, and closes it on
 * sign-out.
 *
 * Without this gate the WS-real branch opened its socket from the `WsAdapter`
 * constructor — i.e. at app mount, before the login screen had even rendered.
 * With no session token the upgrade carries no `?access=` param, the server's
 * `verifyClient` rejects it 401, and the adapter's auto-reconnect retried the
 * same tokenless upgrade every few seconds for as long as the user sat on the
 * login screen.
 *
 * `AuthPresenter.state$` is a replaying BehaviorSubject, so a resumed session
 * connects synchronously here — a returning user is authenticated at
 * composition time and must not be stranded behind a closed transport.
 *
 * A no-op when no transport is supplied (simulator mode has no socket).
 */
function gateTransportOnAuth(
  transport: AuthGatedTransport | undefined,
  auth: AuthPresenter,
): void {
  if (!transport) {
    return;
  }

  auth.state$
    .pipe(
      map((state) => {
        return state.status === "authenticated";
      }),
      distinctUntilChanged(),
    )
    .subscribe((isAuthenticated) => {
      if (isAuthenticated) {
        transport.connect();
      } else {
        transport.disconnect();
      }
    });
}

/** Build the app-layer machine factories the ViewModel seam injects. Each factory
 * spins up a fresh machine per component mount, wired to the presenters. */
export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return {
    tileExecution: (pair: CurrencyPair) => {
      return createTileExecutionMachine(pair, {
        execute: (input: ExecuteTradeInput) => {
          return presenters.execution.execute(input);
        },
      });
    },
    rfqTile: (pair: CurrencyPair) => {
      return createRfqTileMachine(pair, {
        requestQuote: (symbol: string, pipsPosition: number) => {
          return presenters.rfqQuote.requestQuote(symbol, pipsPosition);
        },
      });
    },
    staleFlag: (pair: CurrencyPair) => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.priceStream.price$(pair),
      });
    },
    analyticsStaleFlag: () => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.analytics.position$,
      });
    },
    rowHighlight: (isNew: boolean) => {
      return createRowHighlightMachine(isNew);
    },
    notional: (defaultNotional: number) => {
      return createNotionalMachine(defaultNotional);
    },
    rfqSubmission: () => {
      return presenters.rfqs.createSubmission();
    },
    ticketSubmission: () => {
      return presenters.rfqs.createTicketSubmission();
    },
    layout: (tab: WorkspaceTab) => {
      return createLayoutMachine(createDefaultLayoutPort(tab));
    },
    boot: (onDone: () => void) => {
      return createBootSequenceMachine({
        variant: presenters.bootPreference.current(),
        advance: (next: BootVariant): void => {
          presenters.bootPreference.setVariant(next);
        },
        onDone,
      });
    },
    orderTicket: (defaultSymbol: string) => {
      return createOrderTicketMachine({
        place: (req: Parameters<typeof presenters.ordersBlotter.place>[0]) => {
          return presenters.ordersBlotter.place(req);
        },
        defaultSymbol,
      });
    },
  };
}
