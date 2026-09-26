import {
  BehaviorSubject,
  combineLatest,
  EMPTY,
  type Observable,
  of,
  Subject,
} from "rxjs";
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  skip,
  take,
} from "rxjs/operators";

import type {
  App,
  AppCommands,
  AppPorts,
  AuthPresenter as AuthPresenterApi,
  CoreFactory,
  EqWorkspaceIntents,
  EqWorkspaceState,
  Presenters,
  RfqCountdownSeed,
  WorkspaceNavIntents,
  WorkspaceNavState,
} from "@rtc/core-api";
import type { LayoutState } from "@rtc/core-logic";
import {
  createAuthDeps,
  createDefaultLayoutPort,
  createWorkspaceDock,
  firstWatchlistSymbol,
  InMemoryDockLayoutStore,
  InMemoryLayoutPresetStore,
  LAYOUT_PANEL_IDS,
  type Machine,
  type MachineFactories,
  modelFacingHistory,
  type WorkspaceTab,
} from "@rtc/core-logic";
import type {
  BootVariant,
  ConnectionEvent,
  CurrencyPair,
  EquityInstrument,
  ExecuteTradeInput,
  JarvisSkin,
  PowerSaverLevel,
  Price,
  ThemeSkin,
} from "@rtc/domain";

import { withLoginDelay } from "#/adapters/delayedAuthPort";
import type { IWsAdapter } from "#/adapters/IWsAdapter";
import type { AuthGatedTransport } from "#/adapters/portFactory";
import { readPreferenceNow } from "#/adapters/readPreferenceNow";
import { createLayoutPresets } from "#/layout/createLayoutPresets";
import { createWorkspacePersistenceWriter } from "#/layout/workspacePersistenceWriter";
import {
  AmbientStylePresenter,
  AnalyticsPresenter,
  AnimatedBackgroundPresenter,
  AnimationDirector,
  type AnimationDirectorDeps,
  AuthPresenter,
  BlotterPresenter,
  BootGatePresenter,
  BootPreferencePresenter,
  CandleSeriesPresenter,
  ChartSubstratePresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  createBootSequenceMachine,
  createEqDrawingsMachine,
  createEqWorkspaceMachine,
  createIncidentMachine,
  createJarvisDemoMachine,
  createJarvisDriverMachine,
  createJarvisMachine,
  createJarvisPanelsMachine,
  createLayoutMachine,
  createNarratorMachine,
  createNotionalMachine,
  createOrderTicketMachine,
  createRfqCountdownMachine,
  createRfqTileMachine,
  createRowHighlightMachine,
  createStaleFlagMachine,
  createTileExecutionMachine,
  createWorkspaceNavMachine,
  DealersPresenter,
  DepthPresenter,
  EqBlotterViewPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
  ErrorRatePresenter,
  EventLogPresenter,
  ForceBootAnimationPresenter,
  InstrumentsPresenter,
  type JarvisDriverDeps,
  type JarvisEntry,
  JarvisPanelsPresenter,
  JarvisPreferencesPresenter,
  JarvisUsagePresenter,
  LatencyPresenter,
  LayoutEnginePresenter,
  type LayoutIntents,
  LoginWaitPreferencesPresenter,
  OrdersBlotterPresenter,
  type PanelInstance,
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
} from "#/presenters/index";

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

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 5) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { App, AppCommands, AppPorts, CoreFactory, Presenters };

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
      first = firstWatchlistSymbol(list);
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
      return firstWatchlistSymbol(list);
    }),
    filter((symbol) => {
      return symbol !== "";
    }),
    take(1),
  );
}

/** Moved to `@rtc/core-logic`'s `presenters/jarvisController` (pluggable-core
 * slice 7 wave 2, then slice 8) with the rest of the history rules —
 * re-exported for existing imports. */
export {
  historyEntriesExcludingInFlightTurn,
  LAYOUT_PANEL_IDS,
  STATIC_WORKSPACE_PANEL_IDS,
} from "@rtc/core-logic";

/**
 * Threads `presenters.jarvis`'s own state back into `ports.jarvis` as its
 * chat-history replay source — only when `ports.jarvis` offers the
 * optional `setHistorySource` (`WsJarvisAdapter`, WS-real mode; an optional
 * port member rather than an instanceof check since pluggable-core slice 7
 * wave 2, so a port that cannot be that class — an alternative core's, the
 * contract harness's — is wired the same way). Simulator mode's
 * `ScriptedJarvisAdapter` has no `setHistorySource` and needs none — its brain already runs against the live application state
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
  if (jarvisPort.setHistorySource === undefined) {
    return;
  }

  let latestEntries: readonly JarvisEntry[] = [];

  const subscription = jarvisMachine.state$.subscribe((state) => {
    latestEntries = state.entries;
  });

  jarvisPort.setHistorySource(() => {
    return modelFacingHistory(latestEntries);
  });

  const disposeMachine = jarvisMachine.dispose;

  jarvisMachine.dispose = (): void => {
    subscription.unsubscribe();
    disposeMachine();
  };
}

/** Members an alternative core owns NATIVELY while this app's internal
 * consumers still need to reach them — strangler-phase scaffolding, deleted
 * with delegation in slice 8. The base app still builds and exposes its OWN
 * instance of each (so the siblings' parity drift test can tell native from
 * delegated by reference); a seam only redirects what this app's INTERNAL
 * readers — `JarvisDriverMachine`, `AnimationDirector`, `NarratorMachine`
 * and the base `eqWorkspace`'s seed — read. Without one, a Jarvis drive
 * batch would mutate a workspace the UI no longer renders, an FX fill made
 * through the native `execution` would never reach the director, and every
 * port those readers share with a native member would be held twice (for
 * the simulator's pricing, a doubled tick rate). Every `AnimationDirector`
 * source is a seam, hence the `Partial`. */
export interface CoreSeams extends Partial<AnimationDirectorDeps> {
  readonly eqWorkspace?: Machine<EqWorkspaceState, EqWorkspaceIntents>;
  readonly watchlist$?: Observable<readonly EquityInstrument[]>;
  readonly workspaceNav?: Machine<WorkspaceNavState, WorkspaceNavIntents>;
  /** "A sibling core owns the Jarvis family and its workspace"
   * (pluggable-core slice 7 wave 2, ruling 5). This app still builds every
   * member — the parity drift test needs its own instances — but none of
   * them reaches a port or the wire: its `jarvis` subscribes no
   * `availability$` (a cold, per-subscription server request) and registers
   * no history source (a single-slot port method); no narrator is built (it
   * would ask a second time per anomaly); the panels, driver and demo fold
   * nothing; and its workspace restores nothing and writes nothing. */
  readonly nativeJarvis?: true;
}

export function createApp(ports: AppPorts, seams: CoreSeams = {}): App {
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
  // The roster this app's own readers (the workspace seed below, the Jarvis
  // driver's `knownSymbols$`) follow — a native core's, when it has one.
  const watchlist$ = seams.watchlist$ ?? watchlist.watchlist$;
  const eqWorkspace = createEqWorkspaceMachine({
    initialSymbol: peekFirstWatchlistSymbol(watchlist$),
    seed$: firstWatchlistSymbol$(watchlist$),
  });
  // Likewise the FX roster and per-pair prices `AnimationDirector` and
  // `NarratorMachine` both read.
  const pairs$ = seams.pairs$ ?? currencyPairs.pairs$;
  const priceFor =
    seams.priceFor ??
    ((pair: CurrencyPair): Observable<Price> => {
      return priceStream.price$(pair);
    });

  // Hoisted (rather than built inline in the `presenters` literal below,
  // where it used to live) so JarvisDriverMachine's `setThemeSkin` closure
  // can call `.setSkin` on the SAME instance the `presenters` literal below
  // exposes — one preference presenter, not two independent ones racing the
  // same underlying preferences port.
  const themeSkinPreference = new ThemeSkinPreferencePresenter(
    ports.preferences,
  );

  // Hoisted (rather than built inline in the `presenters` literal below,
  // mirroring themeSkinPreference above) so NarratorMachine (Task 9, wired
  // below alongside jarvisDriver) can consume `.narrator$` — the user's
  // stored preference for whether the proactive narrator may dispatch
  // unsolicited turns.
  const jarvisPreferences = new JarvisPreferencesPresenter(ports.preferences);

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
    // Only WsJarvisAdapter (WS-real mode) offers the optional
    // availability$ — see wireJarvisHistorySource's doc above for why it is
    // an optional port member. Simulator mode's ScriptedJarvisAdapter has none and
    // needs none: createJarvisMachine defaults an absent availability$ to
    // an always-available, scripted-only value, so sim stays permanently
    // available offering only the scripted brain.
    availability$: seams.nativeJarvis
      ? undefined
      : ports.jarvis.availability$?.(),
    preferredBrain$: ports.preferences.jarvisBrain$(),
    effort$: ports.preferences.jarvisEffort$(),
  });

  // One guarded source for every fold over `jarvis.events$`: each fold's
  // `events$` input is TERMINAL on error (kills its fold + reports
  // unhandled), and nothing about `jarvis.events$` itself rules that out.
  // A cold pipe, so each fold still holds its own subscription.
  const jarvisEvents$ = jarvis.events$.pipe(
    catchError(() => {
      return EMPTY;
    }),
  );

  // Every internal fold over this app's Jarvis events, or nothing at all
  // when a sibling core owns the family (`CoreSeams.nativeJarvis`): then its
  // panels machine folds nothing (so its presenter opens no port streams),
  // no docked panel is restored, and no persistence writer is built — the
  // `workspaceLayout` preference has exactly one writer, the native core's.
  const foldedJarvisEvents$ = seams.nativeJarvis ? EMPTY : jarvisEvents$;
  const workspaceIsNative = seams.nativeJarvis === true;

  // Hoisted out of the `JarvisPanelsPresenter` construction below (where it
  // used to be an inline argument) because the workspace-persistence wiring
  // needs the MACHINE's own state, not the presenter's VM rows: the writer
  // has to persist each docked panel's `PanelSpecV1`, and `JarvisPanelVm`
  // deliberately carries an interpreted `data$` instead of the raw spec.
  const jarvisPanelsMachine = createJarvisPanelsMachine(foldedJarvisEvents$);

  const jarvisPanels = new JarvisPanelsPresenter(jarvisPanelsMachine, {
    referenceData: ports.referenceData,
    pricing: ports.pricing,
    blotter: ports.blotter,
    analytics: ports.analytics,
  });

  // Session-lifetime mirror of the panels fold, so the dock bridges and the
  // persistence writer can read "what is docked right now" synchronously
  // (`createWorkspaceDock`'s `panels.current()` contract). Every emission is
  // synchronous with the intent that caused it (Subject → scan → state).
  // Never unsubscribed — same session-lifetime doctrine as
  // `jarvisPanels`/`jarvisDriver` themselves.
  let latestPanels: readonly PanelInstance[] = [];
  jarvisPanelsMachine.state$.subscribe((panelsState) => {
    latestPanels = panelsState.panels;
  });

  // Hoisted (rather than built inline in the `presenters` literal below,
  // unlike eqWorkspace) so JarvisDriverMachine — composed here beside
  // jarvisPanels, same scope — can target this singleton's switchTab intent
  // from a "switchTab" DriveCommand. Takes no deps, unlike eqWorkspace/
  // incident, so it needs nothing else built first.
  const workspaceNav = createWorkspaceNavMachine();
  // The INTERNAL readers — the Jarvis driver's `switchTab` and the dock
  // bridges' `latestActiveTab` mirror — follow the native nav when a sibling
  // core supplies one (`CoreSeams.workspaceNav`); `presenters.workspaceNav`
  // stays this app's own instance, the `eqWorkspace` precedent.
  const activeNav = seams.workspaceNav ?? workspaceNav;
  const authDeps = createAuthDeps(ports, {
    readNow: readPreferenceNow,
    delayAuth: withLoginDelay,
  });

  // Session-lifetime mirror of the active tab, for the same synchronous-read
  // reason as `latestPanels` above: `dockPanelIntoWorkspace` has to know
  // which tab is on screen at the instant of the dock.
  let latestActiveTab: WorkspaceTab = "fx";
  activeNav.state$.subscribe((navState) => {
    latestActiveTab = navState.activeTab;
  });

  /** Backs `Presenters.dockLayoutStore` — hoisted to a local so the
   * workspace dock's reset sweep, the presets controller and the presenters
   * literal below share the exact SAME instance rather than each evaluating
   * `ports.dockLayoutStore ?? new InMemoryDockLayoutStore()` separately
   * (which would construct two independent fallback stores, leaving Reset
   * clearing one while the UI reads the other). */
  const dockLayoutStore =
    ports.dockLayoutStore ?? new InMemoryDockLayoutStore();

  /** Kicked after EVERY change to which tab a docked panel belongs to (the
   * dock's `onDockedMembershipChange`) — see `dockedPanelIdsFor`'s doc for
   * why this exists: `jarvisPanelsMachine.state$` emits a panel's `docked`
   * flip SYNCHRONOUSLY, before the dock bridge has had a chance to attribute
   * it to a tab, so subscribing to `state$` alone would combine the flip with
   * a not-yet-updated attribution. Nexting this AFTER the attribution write
   * is what makes the attributed membership visible. */
  const dockedPanelTabsKick$ = new BehaviorSubject<void>(undefined);

  /** Backs `Presenters.workspaceLayoutResets$` — see its doc. Bumped exactly
   * once, as the LAST step of a reset or a preset load/resetTab. */
  const workspaceLayoutResets$ = new BehaviorSubject<number>(0);

  /** One kick per change worth persisting; the writer debounces the burst. */
  const persistKick$ = new Subject<void>();

  // The dock bridges and their bookkeeping — the shared, rxjs-free rules
  // every application core wires (see `createWorkspaceDock`'s doc).
  const workspaceDock = createWorkspaceDock({
    panels: {
      current: (): readonly PanelInstance[] => {
        return latestPanels;
      },
      dock: jarvisPanelsMachine.dockPanel,
      undock: jarvisPanelsMachine.undockPanel,
      dismiss: jarvisPanels.dismissPanel,
      restore: jarvisPanelsMachine.restoreDockedPanel,
    },
    layoutFor,
    activeTab: (): WorkspaceTab => {
      return latestActiveTab;
    },
    readStoredLayout: (): string | null => {
      return readPreferenceNow(ports.preferences.workspaceLayout$(), null);
    },
    clearStoredLayout: (): void => {
      ports.preferences.setWorkspaceLayout(null);
    },
    dockLayoutStore,
    onDockedMembershipChange: (): void => {
      dockedPanelTabsKick$.next(undefined);
    },
    onResetsBump: (): void => {
      workspaceLayoutResets$.next(workspaceLayoutResets$.value + 1);
    },
  });

  // Per-tab layout SINGLETON map (Presenters.layoutFor's backing store) —
  // resolves the Task 6 review's documented deferral: `layout` used to be a
  // bare "fresh machine per call" factory (mirroring MachineFactories'
  // OLD contract), so a driven "layout" command mutated a throwaway
  // instance nothing else ever read from. Built lazily (one entry per tab,
  // on first request) rather than eagerly for all four tabs — cheap either
  // way (4-entry cap), but lazy matches every other on-demand construction
  // in this function. `layoutFor` is exposed on `Presenters` so BOTH
  // `jarvisDriver`'s `layout` dep below AND `createMachineFactories`'s
  // `layout` field (see below) resolve to the exact same instance per tab.
  //
  // Two parallel maps, not one: `layoutMachinesReal` holds the actual
  // `createLayoutMachine` instances (a genuinely disposable `dispose()`),
  // kept PRIVATE to this closure — nothing outside `createApp()` ever sees
  // it. `layoutHandles` is what `layoutFor` actually returns: the same
  // `state$`/`intents` wired straight through, but `dispose` replaced with
  // a documented no-op. This makes the composition-root-singleton
  // invariant STRUCTURAL, not just documentation: `MachineFactories.layout`
  // has the identical shape as every per-mount factory a `useMachine`
  // bridge disposes on unmount — so ANY future consumer that reaches this
  // singleton through such a bridge (rather than the current non-disposing
  // `useLayout` both bindings actually use — solid-bindings via `toSignal`,
  // react-bindings via `useStateObservable`, neither routing through
  // `useMachine`) would find `.dispose()` harmless instead of completing
  // the real machine's Subjects and caching the corpse in the Map forever.
  // The real machine's dispose stays reachable via `layoutMachinesReal` for
  // a hypothetical future composition-root teardown path — unused today,
  // same no-teardown-seam doctrine as `eqWorkspace`/`workspaceNav`/
  // `jarvisPanels`/`jarvisDriver`.
  const layoutMachinesReal = new Map<
    WorkspaceTab,
    Machine<LayoutState, LayoutIntents>
  >();

  const layoutHandles = new Map<
    WorkspaceTab,
    Machine<LayoutState, LayoutIntents>
  >();

  // Boot-time rehydration of the stored docked panels — after the layout
  // maps above exist (a restore that ever reached `layoutFor` must not hit
  // their temporal dead zone) and before the writer's `skip(1)` panels
  // subscription below (a restore is not a change worth persisting). A
  // seamed app's own panels stay empty: the native core restores into ITS
  // workspace.
  if (!workspaceIsNative) {
    workspaceDock.restorePersistedDocks();
  }

  function layoutFor(tab: WorkspaceTab): Machine<LayoutState, LayoutIntents> {
    const existingHandle = layoutHandles.get(tab);

    if (existingHandle) {
      return existingHandle;
    }

    // The DEFAULT port is passed unchanged and the persisted tree goes in as
    // `seedState`: the machine derives its `staticIds` from `port.initial`
    // (so a restored dock column is still recognised as one, instead of its
    // leaves counting as static ids and the next dock building a SECOND
    // column), and `reset()` returns `port.initial` (the default tree, which
    // is the whole point of the intent). See `LayoutMachineOptions.seedState`.
    const machine = createLayoutMachine(createDefaultLayoutPort(tab), {
      seedState: workspaceDock.seedFor(tab),
    });
    layoutMachinesReal.set(tab, machine);

    // Records synchronously (the replay-current `state$`), before this
    // function returns — `createWorkspaceDock`'s `layoutFor` contract.
    machine.state$.subscribe((layoutState) => {
      workspaceDock.recordLayoutState(tab, layoutState);
    });

    // `skip(1)` drops the replay of the state this machine was just created
    // with: merely OPENING a tab is not a change worth persisting, and
    // without the skip a fresh app would write a payload of pure defaults on
    // first render. Both subscriptions are session-lifetime and deliberately
    // never unsubscribed — the same documented non-teardown as the jarvis
    // history cache above; these machines live for the whole session.
    machine.state$.pipe(skip(1)).subscribe(() => {
      persistKick$.next();
    });

    const handle: Machine<LayoutState, LayoutIntents> = {
      state$: machine.state$,
      intents: machine.intents,
      dispose: () => {
        // Deliberately inert — see this map pair's doc above. Composition
        // owns this machine's lifetime; a consumer's dispose() must never
        // tear down a shared singleton for every other consumer.
      },
    };

    layoutHandles.set(tab, handle);
    return handle;
  }

  /** See `Presenters.dockedPanelIdsFor`'s doc. `combineLatest` with
   * `dockedPanelTabsKick$` is load-bearing, not decorative: `jarvisPanelsMachine`
   * flips a panel's `docked` flag SYNCHRONOUSLY inside the dock bridge, before
   * that same call goes on to attribute the panel to a tab — so a bare
   * `jarvisPanelsMachine.state$.pipe(map(...))` would compute this tab's
   * membership against an attribution that hasn't been written yet, on the
   * very emission that matters. The dock kicks `dockedPanelTabsKick$` AFTER
   * every attribution change (dock, undock, dismiss, reset), which is what
   * makes the attributed membership visible to a subscriber. */
  function dockedPanelIdsFor(tab: WorkspaceTab): Observable<readonly string[]> {
    return combineLatest([
      jarvisPanelsMachine.state$,
      dockedPanelTabsKick$,
    ]).pipe(
      map(([panelsState]) => {
        // Sorted: `panelsState.panels`' own order reflects spawn/dock
        // sequencing, which is incidental to this stream's membership
        // contract — sorting stabilizes the emitted array's identity for
        // downstream element-wise-equals consumers (both clients' bridge
        // props) against a reorder that isn't a real membership change.
        return workspaceDock.dockedIdsIn(tab, panelsState.panels).sort();
      }),
      distinctUntilChanged((prev, next) => {
        return (
          prev.length === next.length &&
          prev.every((id, index) => {
            return id === next[index];
          })
        );
      }),
    );
  }

  /** Saved layouts (Phase 6b). Every rule lives in the controller; this hands
   * it the store (falling back like `dockLayoutStore` above), the per-tab
   * layout singletons, the dock's two synchronous reads, and the rebuild
   * signal — which is `workspaceLayoutResets$` itself (ruling P4: the preset
   * path reuses the reset counter rather than adding a second one, since both
   * mean exactly "re-seed the mounted Dockview engine from the store"). */
  const layoutPresets = createLayoutPresets({
    store: ports.layoutPresetStore ?? new InMemoryLayoutPresetStore(),
    dockLayoutStore,
    layoutFor,
    layoutStateNow: workspaceDock.layoutStateNow,
    dockedPanelIdsNow: workspaceDock.dockedPanelIdsNow,
    rebuildLiveEngine: () => {
      workspaceLayoutResets$.next(workspaceLayoutResets$.value + 1);
    },
  });

  if (!workspaceIsNative) {
    // The debounced workspace writer. Kicked by every created layout machine
    // (above) and by the panels fold; assembles the payload read-modify-write
    // so tabs never opened this session keep their stored entry. Session-
    // lifetime, never unsubscribed — same doctrine as the driver-outcomes
    // subscription below.
    //
    // `map` + `distinctUntilChanged` on the panels ARRAY, not the state
    // object: every intent produces a fresh state object even when its
    // reducer was a no-op (`{ ...s, panels }` with the very same `panels`
    // reference), so subscribing to `state$` directly would kick — and write
    // — on a rejected dock of an unknown panel id. Reference equality is
    // exactly the right test here: the panels reducers only build a new array
    // when they actually change something.
    jarvisPanelsMachine.state$
      .pipe(
        map((panelsState) => {
          return panelsState.panels;
        }),
        distinctUntilChanged(),
        skip(1),
      )
      .subscribe(() => {
        persistKick$.next();
      });

    createWorkspacePersistenceWriter({
      kick$: persistKick$,
      readStoredLayout: () => {
        return readPreferenceNow(ports.preferences.workspaceLayout$(), null);
      },
      writeStoredLayout: (value: string) => {
        ports.preferences.setWorkspaceLayout(value);
      },
      createdLayouts: workspaceDock.createdLayouts,
      dockedPanels: workspaceDock.dockedPlacements,
    });
  }

  // JarvisDriverMachine: the total DriveCommand interpreter (Task 6). SAME
  // catchError/EMPTY guard as jarvisPanels above — createJarvisDriverMachine's
  // events$ input is equally TERMINAL on error, and both fold over the same
  // jarvis.events$ source, so a source error must not kill either fold.
  // `layout` is `layoutFor` itself (Task 10's resolution of the Task 6
  // review's documented deferral) — the SAME per-tab singleton map
  // `Presenters.layoutFor`/`createMachineFactories`'s `layout` field expose
  // to the UI, so a driven "layout" command is now observable through the
  // mounted `useLayout(tab)` view instead of a throwaway instance.
  //
  // Built as an intermediate const rather than an inline call argument
  // purely for length: the deps list grew four members with the pinned-panel
  // round (`dockPanel`, `undockPanel`, `livePanelIds$`, `dockedPanelIds$`).
  const jarvisDriverDeps: JarvisDriverDeps = {
    events$: foldedJarvisEvents$,
    workspaceNav: activeNav,
    layout: layoutFor,
    eqWorkspace: seams.eqWorkspace ?? eqWorkspace,
    setThemeSkin: (skin: ThemeSkin): void => {
      themeSkinPreference.setSkin(skin);
    },
    setPowerSaver: (level: PowerSaverLevel): void => {
      powerSaver.setLevel(level);
    },
    dismissPanel: workspaceDock.dismissPanel,
    knownLayoutPanelIds: (tab: WorkspaceTab): readonly string[] => {
      return LAYOUT_PANEL_IDS[tab];
    },
    detachedPanelIds: workspaceDock.detachedPanelIds,
    knownSymbols$: watchlist$.pipe(
      map((list) => {
        return list.map((instrument) => {
          return instrument.symbol;
        });
      }),
    ),
    powerSaverLevel$: powerSaver.level$,
    /** Every live desk-panel id, floating or docked — the membership check a
     * driven `dockPanel` command needs (unlike `dismissPanel`, docking an
     * unknown id is worth reporting as skipped). */
    livePanelIds$: jarvisPanelsMachine.state$.pipe(
      map((panelsState) => {
        return panelsState.panels.map((panel) => {
          return panel.panelId;
        });
      }),
    ),
    /** The docked subset of `livePanelIds$` — a driven `undockPanel`'s own
     * membership check, and what tells a redundant dock apart from a real one. */
    dockedPanelIds$: jarvisPanelsMachine.state$.pipe(
      map((panelsState) => {
        return panelsState.panels
          .filter((panel) => {
            return panel.docked;
          })
          .map((panel) => {
            return panel.panelId;
          });
      }),
    ),
    dockPanel: workspaceDock.dockPanel,
    undockPanel: workspaceDock.undockPanel,
  };

  const jarvisDriver = createJarvisDriverMachine(jarvisDriverDeps);

  // Feeds the driver's per-command outcomes back into the chat transcript
  // (Task 10 follow-up ruling): JarvisMachine.intents.recordDriveOutcome
  // folds each "applied" outcome into a new "drive: <kind>" entry;
  // "skipped" outcomes fold nothing (JarvisMachine.ts's own doc). Wired
  // HERE, after BOTH singletons exist — jarvisDriver is built FROM
  // jarvis.events$, so jarvis can't depend on jarvisDriver's OUTPUT at
  // construction time without a cycle; this late-bound subscription is the
  // same shape wireJarvisHistorySource (below) uses for its own
  // cross-machine feed. No held reference / no teardown seam needed:
  // outcomes$ is a plain Subject that never errors or completes for the
  // app's whole session, matching jarvisPanels/jarvisDriver/
  // NarratorMachine's own no-dispose doctrine.
  jarvisDriver.outcomes$.subscribe((outcome) => {
    jarvis.intents.recordDriveOutcome(outcome);
  });

  // JarvisDemoMachine: the hands-free scripted demo. Same catchError/EMPTY
  // guard on jarvis.events$ as jarvisPanels/jarvisDriver above — its own
  // events$ input is equally terminal on error (see JarvisDemoDeps.jarvisEvents$'s
  // doc for why it needs the raw event stream at all: entries alone can't
  // tell a "done" turn from an "error" one). `jarvis.intents` is narrowed to
  // the four members the demo actually drives (Pick<...>) rather than
  // passed through whole, so this machine can never reach for `send`/
  // `narrate`/`approveConfirmation` — it must only ever run SCRIPTED,
  // never-approve turns.
  const jarvisDemo = createJarvisDemoMachine({
    jarvisState$: jarvis.state$,
    jarvisEvents$: foldedJarvisEvents$,
    jarvis: jarvis.intents,
    powerSaverLevel$: powerSaver.level$,
  });

  // NarratorMachine (Task 9): the capped client-side proactive narration
  // loop. A composition-root singleton, same doctrine as jarvisPanels/
  // jarvisDriver above — built once, warm-subscribed for the app's whole
  // session, never re-created per consumer. Its own `catchError`/`EMPTY`
  // guard is internal (see createNarratorMachine's doc) — unlike
  // jarvisPanels/jarvisDriver, it reads no jarvis.events$, so it needs no
  // guard here. `ports.narratorConfig` is the dev-only relaxed-threshold
  // seam (`?narratorThresholds=test`, both web clients'
  // buildBrowserPorts.ts) — undefined in production, so the detector runs
  // at DEFAULT_ANOMALY_CONFIG. The return value's `stop()` is unused here:
  // this machine, like jarvisPanels/jarvisDriver, lives for the app's whole
  // session with no composition-root teardown seam.
  //
  // `priceFor` is `priceStream.price$` — the SAME shared per-symbol cache
  // AnimationDirector's own `priceFor` reads above, NOT a direct
  // `ports.pricing.getPriceUpdates` call (review fix, T9 round 1): the
  // simulator's live tick stream is cold per subscription and mutates
  // SHARED per-pair state on its own timer loop, so an independent second
  // subscription to the same symbol doubles its effective tick rate (the
  // #171 tick-acceleration family) — see NarratorDeps.priceFor's doc for
  // the full rationale and the two accepted consequences (permanently
  // pinning those shared streams warm; conflation under power-saver calm).
  if (!seams.nativeJarvis) {
    createNarratorMachine({
      pairs$,
      priceFor,
      narrate: (prompt: string): void => {
        jarvis.intents.narrate(prompt);
      },
      preference$: jarvisPreferences.narrator$,
      config: ports.narratorConfig,
    });
  }

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
    chartSubstrate: new ChartSubstratePresenter(ports.preferences),
    layoutEngine: new LayoutEnginePresenter(ports.preferences),
    dockLayoutStore,
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
    // INVARIANT: every source is `seams.x ?? own` — a dep added to
    // `AnimationDirectorDeps` joins `CoreSeams` through the `Partial` and
    // must be routed the same way here, never as a bare `own`.
    animationDirector: new AnimationDirector({
      pairs$,
      priceFor,
      connectionStatus$: seams.connectionStatus$ ?? connection.status$,
      executions$: seams.executions$ ?? execution.executions$,
      rfqEvents$: seams.rfqEvents$ ?? rfqs.events$,
      equityFills$: seams.equityFills$ ?? ordersBlotter.fills$,
    }),
    bootPreference: new BootPreferencePresenter(ports.preferences),
    // Boot-splash visibility, seeded once from the platform's boot-splash
    // decision (defaults to playing when no bootSplash port is supplied).
    bootGate: new BootGatePresenter(ports.bootSplash?.shouldPlay() ?? true),
    // Login/lock/logout lifecycle over the injected AuthPort + SessionStore;
    // the login-delay wrapper and the wait-style cycle are `createAuthDeps`,
    // shared with the sibling cores (pluggable-core slice 6).
    auth: new AuthPresenter(
      authDeps.auth,
      authDeps.store,
      undefined,
      authDeps.cycle,
    ),
    loginWaitPreferences: new LoginWaitPreferencesPresenter(ports.preferences),
    jarvisPreferences,
    watchlist,
    candleSeries: new CandleSeriesPresenter(ports.marketData),
    depth: new DepthPresenter(ports.marketData),
    ordersBlotter,
    positions: new PositionsPresenter(ports.positions),
    incident: createIncidentMachine({
      controls: ports.metricControls,
      pushConnectionEvent: (ev: ConnectionEvent) => {
        ports.connectionIntents.injectIncident(ev);
      },
    }),
    eqWorkspace,
    workspaceNav,
    layoutFor,
    eqDrawings: createEqDrawingsMachine(),
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
    dockPanel: workspaceDock.dockPanel,
    dockedPanelIdsFor,
    undockPanel: workspaceDock.undockPanel,
    dismissPanel: workspaceDock.dismissPanel,
    resetWorkspaceLayout: workspaceDock.resetWorkspaceLayout,
    workspaceLayoutResets$,
    layoutPresets,
    jarvisDriver,
    jarvisDemo,
  };

  if (!seams.nativeJarvis) {
    wireJarvisHistorySource(ports.jarvis, presenters.jarvis);
  }

  gateTransportOnAuth(ports.transport, presenters.auth);

  const commands: AppCommands = {
    reconnect: () => {
      ports.connectionIntents.reconnect();
    },
    reportDetachedPanels: workspaceDock.reportDetachedPanels,
  };
  return {
    presenters,
    ports,
    commands,
    dispose: async (): Promise<void> => {
      // A knowing no-op. `createApp` opens session-lifetime subscriptions it
      // never unsubscribes — state mirrors, workspace-persistence kicks, the
      // driver→chat outcome feed, the auth→transport gate — plus machines with
      // no dispose of their own (NarratorMachine); nothing else in the app
      // tears them down either. The intended follow-up is a `Subscription` bag
      // collected across `createApp` and unsubscribed here.
    },
  };
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
 * `AuthPresenter.state$` is a replay-current `StateObservable` over the
 * presenter's `BehaviorSubject`, so a resumed session's state is delivered
 * synchronously here — a returning user is authenticated at composition time
 * and must not be stranded behind a closed transport.
 *
 * A no-op when no transport is supplied (simulator mode has no socket).
 */
function gateTransportOnAuth(
  transport: AuthGatedTransport | undefined,
  auth: AuthPresenterApi,
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

/** Build the app-layer machine factories the ViewModel seam injects. Most
 * factories spin up a fresh machine per component mount, wired to the
 * presenters — `layout` is the one documented exception: it resolves to
 * `presenters.layoutFor(tab)`, a composition-root SINGLETON per tab (see
 * `Presenters.layoutFor`'s doc), so every call with the same `tab` returns
 * the SAME instance rather than a fresh one. */
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
    rfqCountdown: (seed: RfqCountdownSeed) => {
      return createRfqCountdownMachine(seed);
    },
    layout: (tab: WorkspaceTab) => {
      return presenters.layoutFor(tab);
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

/** The RxJS core as a `CoreFactory` — what `selectCore` returns for
 * `VITE_CORE_IMPL=rxjs` and what the alternative cores delegate to. */
export const rxjsCore: CoreFactory = { createApp, createMachineFactories };
