import { state } from "@rx-state/core";
import type { JarvisWorld, World } from "@ui-contract/harness/world";
import {
  BehaviorSubject,
  combineLatest,
  EMPTY,
  type Observable,
  of,
  Subject,
  throwError,
} from "rxjs";
import { catchError, distinctUntilChanged, map, skip } from "rxjs/operators";
import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";

import type {
  DockedPanelPlacement,
  DriveOutcome,
  JarvisDemoMachineHandle,
  JarvisDriverMachineHandle,
  JarvisDriverState,
  JarvisMachineHandle,
  JarvisPanelsMachineHandle,
  JarvisPanelVm,
  LayoutIntents,
  LayoutNode,
  LayoutState,
  Machine,
  PanelData,
  PanelInstance,
  RfqSubmissionState,
  TicketSubmissionState,
  WorkspaceLayoutV1,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/client-core";
import {
  CandleSeriesPresenter,
  createBootSequenceMachine,
  createDefaultLayoutPort,
  createJarvisDemoMachine,
  createJarvisDriverMachine,
  createJarvisMachine,
  createJarvisPanelsMachine,
  createLayoutMachine,
  createNotionalMachine,
  createOrderTicketMachine,
  createRfqCountdownMachine,
  createRfqTileMachine,
  createRowHighlightMachine,
  createStaleFlagMachine,
  createTileExecutionMachine,
  createWorkspaceNavMachine,
  createWorkspacePersistenceWriter,
  InMemoryDockLayoutStore,
  JarvisPanelsPresenter,
  parseWorkspaceLayout,
  STATIC_WORKSPACE_PANEL_IDS,
} from "@rtc/client-core";
import type {
  AmbientStyle,
  Candle,
  CandleTimeframe,
  ChartSubstrate,
  CreateRfqInput,
  CreditRfqFilter,
  CurrencyPair,
  DepthBook,
  EqBlotterView,
  EquityQuote,
  EqWatchlistSort,
  ExecuteTradeInput,
  ExecuteTradeResult,
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  JarvisSkin,
  LayoutEngine,
  LoginWaitDelay,
  LoginWaitStyle,
  MarketDataPort,
  PlaceOrderRequest,
  PowerSaverLevel,
  RfqQuoteResult,
  ThemeSkin,
  ViewMode,
} from "@rtc/domain";
import {
  nextEqWatchlistSort,
  nextPowerSaverLevel,
  nextThemeModePreference,
  resolveThemeMode,
} from "@rtc/domain";
import type { ViewModel } from "@rtc/solid-bindings";
import { useMachine } from "@rtc/solid-bindings";
import { toSignal } from "@rtc/solid-bindings/toSignal";

/** Mirror of RfqsPresenter's presenter-local redirect delay. The contract spec
 * drives this with fake timers (advanceTimersByTimeAsync(1500)), so the fake
 * schedules onRedirect via a REAL setTimeout — preserving the exact timing the
 * spec asserts, instead of redirecting instantly. Same constant as the react
 * driver's viewModelFromWorld.ts. */
const REDIRECT_DELAY_MS = 1500;

/** Return shape of the `useRfqSubmission` fake below — named so the function
 * signature stays free of an inline object return type. */
interface UseRfqSubmissionFake {
  state: Accessor<RfqSubmissionState>;
  submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => void;
}

/** Return shape of the `useTicketSubmission` fake below — named for the same
 * reason as UseRfqSubmissionFake. */
interface UseTicketSubmissionFake {
  state: Accessor<TicketSubmissionState>;
  submitPrice: (quoteId: number, price: number) => void;
  pass: (quoteId: number) => void;
}

/** Wrap a warm (BehaviorSubject-backed) World stream as a Solid accessor.
 * `state()` (from `@rx-state/core`) turns any Observable into the
 * `StateObservable` `@rtc/solid-bindings/toSignal` requires — the same
 * "hot-observable → accessor" idiom `@rtc/solid-bindings`'s own
 * `createViewModel.ts` uses everywhere (e.g. `toSignal(state(presenters.
 * priceStream.price$(pair), null))`), applied here to World subjects instead
 * of real presenters. A World subject is always warm (BehaviorSubject emits
 * its current value synchronously on subscribe), so the passed default is
 * only ever a type-level fallback, never actually served. */
function wrapSubject<T>(subject: BehaviorSubject<T>): Accessor<T> {
  return toSignal(state(subject, subject.getValue()));
}

/** The REAL createJarvisMachine, one shared instance PER WORLD — keyed by
 * World identity (not built inside createWorld itself, since the machine is
 * an application-layer concern; see world.ts's `JarvisWorld` doc comment).
 * Every `solidViewModel(world)` call (one per `mountWith`/`mount`) reuses the
 * same cached machine, mirroring the react driver's own jarvisMachines cache
 * so a co-mounted JarvisOrb + JarvisOverlay observe the same open/phase/
 * entries. Typed as the widened `JarvisMachineHandle` (not the plain
 * `Machine`) so `getJarvisPanelsPresenter` below can read its `events$` —
 * Task 6's sole event source for the generative-UI panels machine, mirroring
 * composition.ts's own `jarvis.events$` wiring. */
const jarvisMachines = new WeakMap<World, JarvisMachineHandle>();

function getJarvisMachine(world: World): JarvisMachineHandle {
  let machine = jarvisMachines.get(world);

  if (!machine) {
    // Typed explicitly (rather than left to inference) so this driver is a
    // real consumer of World.jarvis's declared shape, not just a structural
    // one — see world.ts's JarvisWorld doc comment.
    const jarvisWorld: JarvisWorld = world.jarvis;
    machine = createJarvisMachine({
      port: jarvisWorld.port,
      skin$: world.jarvisSkin,
      setSkin: (skin: JarvisSkin) => {
        world.jarvisSkin.next(skin);
      },
      // World.jarvisAvailability is the structured JarvisAvailability
      // directly (Task 10) — no mapping needed.
      availability$: world.jarvisAvailability,
      // The STORED brain/effort preferences (Task 10) — threaded straight
      // from World so a spec's mount({ jarvisBrain, jarvisEffort }) seed (or
      // a live write through useJarvisPreferences().setBrain/setEffort)
      // actually resolves the machine's effectiveBrain / turn options.
      preferredBrain$: world.jarvisBrain,
      effort$: world.jarvisEffort,
    });
    jarvisMachines.set(world, machine);
    // Register this World's real narrate() intent (Task 12/P5) so
    // world.jarvis.narrate(prompt) — a spec's proactive-turn counterpart to
    // driving send() through a mounted overlay — routes to the SAME machine
    // instance every other Jarvis-consuming component on this World shares.
    // See JarvisWorld.narrate's doc in world.ts.
    world.jarvis.registerNarrate(machine.intents.narrate);
  }

  return machine;
}

/** Every `PanelId` reachable in one layout tree — mirrors the react driver's
 * own copy (Task 12/P5), which itself mirrors `composition.ts`'s
 * module-private `collectPanelIds`. */
function collectPanelIds(node: LayoutNode): readonly string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

/** `JarvisDriverMachine`'s `knownLayoutPanelIds` dep source (Task 12/P5) —
 * mirrors the react driver's own copy. */
function knownLayoutPanelIds(tab: WorkspaceTab): readonly string[] {
  return collectPanelIds(createDefaultLayoutPort(tab).initial.root);
}

/** The REAL `createWorkspaceNavMachine`, one shared instance PER WORLD
 * (Task 12/P5) — mirrors `jarvisMachines`/`getJarvisPanelsPresenter`'s
 * per-World cache, and the react driver's own `workspaceNavs`. `App.tsx`'s
 * promoted composition-root singleton (`Presenters.workspaceNav`) is the
 * production mirror: a driven `"switchTab"` command targets the SAME
 * instance a mounted `AppShell`'s `useWorkspaceNav()` reads from. */
const workspaceNavs = new WeakMap<
  World,
  Machine<WorkspaceNavState, WorkspaceNavIntents>
>();

function getWorkspaceNav(
  world: World,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  let machine = workspaceNavs.get(world);

  if (!machine) {
    machine = createWorkspaceNavMachine();
    workspaceNavs.set(world, machine);
  }

  return machine;
}

/** The REAL per-tab `createLayoutMachine` SINGLETON map, one map PER WORLD
 * (Task 12/P5) — mirrors `composition.ts`'s `layoutFor` and the react
 * driver's own `layoutHandles`: a driven `"layout"` command targets the
 * EXACT instance a mounted `AppShell`'s `useLayout(tab)` reads from. */
const layoutHandles = new WeakMap<
  World,
  Map<WorkspaceTab, Machine<LayoutState, LayoutIntents>>
>();

function getLayoutFor(
  world: World,
  tab: WorkspaceTab,
): Machine<LayoutState, LayoutIntents> {
  let byTab = layoutHandles.get(world);

  if (!byTab) {
    byTab = new Map();
    layoutHandles.set(world, byTab);
  }

  let machine = byTab.get(tab);

  if (!machine) {
    const dock = getWorkspaceDock(world);
    // Seeded from the persisted payload exactly like `composition.ts`'s own
    // `layoutFor`: the DEFAULT port is passed unchanged (so a restored dock
    // column is still recognised as one and `reset()` still returns the
    // default tree) and the stored tree goes in as `seedState`. Lazy, so
    // this consults `dock.persisted` afresh per tab — including after a
    // reset has nulled it.
    machine = createLayoutMachine(createDefaultLayoutPort(tab), {
      seedState: dock.persisted?.tabs[tab]?.layout,
    });
    byTab.set(tab, machine);

    machine.state$.subscribe((layoutState) => {
      dock.layoutStates.set(tab, layoutState);
    });
    // `skip(1)` drops the replay of the state this machine was created with —
    // merely OPENING a tab is not a change worth persisting (composition's
    // own reasoning, reproduced).
    machine.state$.pipe(skip(1)).subscribe(() => {
      dock.kick$.next();
    });
  }

  return machine;
}

/** Everything `composition.ts` keeps BESIDE its layout/panels machines to make
 * docking and workspace persistence work, mirrored here per World — the twin
 * of the react driver's `WorkspaceDock` (see that file for the full
 * rationale). Docking is a two-machine operation (the panels roster AND the
 * active tab's layout tree) and the persisted payload is assembled from both,
 * so neither the panels presenter nor `getLayoutFor` can own this alone.
 *
 * `persisted` is MUTABLE and load-bearing: `getLayoutFor` is lazy, so a tab
 * opened for the first time AFTER a `resetWorkspaceLayout()` would otherwise
 * seed straight back out of the stale snapshot. */
interface WorkspaceDock {
  /** The payload this World booted with (`World.workspaceLayout`'s seed),
   * parsed once — fail-closed, so a corrupt seed is simply `null`. */
  persisted: WorkspaceLayoutV1 | null;
  /** Which tab each docked panel was docked INTO. */
  readonly dockedTabs: Map<string, WorkspaceTab>;
  /** Current `LayoutState` of every tab whose machine has been CREATED. */
  readonly layoutStates: Map<WorkspaceTab, LayoutState>;
  /** One kick per change worth persisting. */
  readonly kick$: Subject<void>;
}

const workspaceDocks = new WeakMap<World, WorkspaceDock>();

/** The four workspace tabs, mirroring `composition.ts`'s module-private
 * `WORKSPACE_TABS` — same "keep a fixture copy rather than reach into
 * composition-root internals" doctrine as `knownLayoutPanelIds`. */
const FIXTURE_WORKSPACE_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "admin",
  "equities",
];

function getWorkspaceDock(world: World): WorkspaceDock {
  const cached = workspaceDocks.get(world);

  if (cached) {
    return cached;
  }

  const dock: WorkspaceDock = {
    persisted: parseWorkspaceLayout(world.workspaceLayout.getValue()),
    dockedTabs: new Map(),
    layoutStates: new Map(),
    kick$: new Subject<void>(),
  };
  workspaceDocks.set(world, dock);

  // The REAL debounced writer over `World.workspaceLayout` — so a dock/undock
  // /layout change genuinely re-serializes through `serializeWorkspaceLayout`
  // (orphan/ghost reconciliation included) and a rehydration spec can hand
  // the result to a SECOND `createWorld`. `debounceMs: 0` because the
  // contract tier asserts WHAT gets persisted, never the settle window —
  // coalescing has its own unit test (`workspacePersistenceWriter.test.ts`).
  createWorkspacePersistenceWriter({
    kick$: dock.kick$,
    readStoredLayout: () => {
      return world.workspaceLayout.getValue();
    },
    writeStoredLayout: (value: string) => {
      world.workspaceLayout.next(value);
    },
    createdLayouts: () => {
      return dock.layoutStates;
    },
    dockedPanels: () => {
      return dockedPlacementsFor(world, dock);
    },
    debounceMs: 0,
  });

  return dock;
}

/** The writer's `dockedPanels()` source. Reads the panels machine only if this
 * World has ALREADY built one: a kick can come from a layout machine alone,
 * and building a panels machine as a side effect of a write would be a
 * surprising place to do it. */
function dockedPlacementsFor(
  world: World,
  dock: WorkspaceDock,
): readonly DockedPanelPlacement[] {
  const cell = panelInstances.get(world);

  if (!cell) {
    return [];
  }

  return cell.current.flatMap((panel): readonly DockedPanelPlacement[] => {
    const tab = dock.dockedTabs.get(panel.panelId);

    // A docked panel with no spec (an "unsupported" instance) or no recorded
    // tab cannot be persisted — the writer prunes its leaf instead.
    if (!panel.docked || !panel.spec || !tab) {
      return [];
    }

    return [{ panelId: panel.panelId, spec: panel.spec, tab }];
  });
}

/** Current value of a warm machine `state$`, read synchronously by
 * subscribing and immediately unsubscribing — this repo's convention for an
 * un-defaulted `StateObservable` whose `getValue()` types as
 * `T | StatePromise<T>` (see `resetWorkspaceLayoutFor`'s own note below). */
function readStateNow<T>(state$: Observable<T>, fallback: T): T {
  let value = fallback;
  state$
    .subscribe((next) => {
      value = next;
    })
    .unsubscribe();
  return value;
}

function isPanelDockedIn(world: World, panelId: string): boolean {
  return panelInstancesFor(world).some((panel) => {
    return panel.panelId === panelId && panel.docked;
  });
}

/** `Presenters.dockPanel` — the layout-tree-integrated dock bridge, mirroring
 * `composition.ts`'s `dockPanelIntoWorkspace` step for step: the static-id
 * collision guard first (docking e.g. "fx-rates" would shadow the static
 * panel through App.tsx's global registry merge AND make every later payload
 * unparseable), then the panels machine — which owns every no-op rule
 * (unknown id / already docked / `MAX_DOCKED_PANELS`) — and only then, if the
 * docked set genuinely changed, the leaf insertion into the ACTIVE tab. */
function dockPanelIntoWorkspace(world: World, panelId: string): void {
  if (STATIC_WORKSPACE_PANEL_IDS.has(panelId)) {
    return;
  }

  if (isPanelDockedIn(world, panelId)) {
    return;
  }

  getJarvisPanelsMachine(world).dockPanel(panelId);

  if (!isPanelDockedIn(world, panelId)) {
    return;
  }

  const tab = readStateNow(
    getWorkspaceNav(world).state$,
    FALLBACK_NAV_STATE,
  ).activeTab;
  getWorkspaceDock(world).dockedTabs.set(panelId, tab);
  getLayoutFor(world, tab).intents.insertPanel(panelId);
}

/** `Presenters.undockPanel` — the inverse; the leaf leaves the tab the panel
 * was docked INTO, which is not necessarily the tab on screen now. */
function undockPanelFromWorkspace(world: World, panelId: string): void {
  if (!isPanelDockedIn(world, panelId)) {
    return;
  }

  getJarvisPanelsMachine(world).undockPanel(panelId);

  if (isPanelDockedIn(world, panelId)) {
    return;
  }

  detachDockedLeaf(world, panelId);
}

function detachDockedLeaf(world: World, panelId: string): void {
  const dock = getWorkspaceDock(world);
  const tab = dock.dockedTabs.get(panelId);
  dock.dockedTabs.delete(panelId);

  if (tab) {
    getLayoutFor(world, tab).intents.removePanel(panelId);
  }
}

/** `Presenters.dismissPanel` — the DOCKED-SAFE dismiss the UI and the driver
 * must both use. The leaf is detached directly rather than by undocking
 * first: `undockPanel` re-admits the panel to the floating set, which can
 * evict an unrelated floating panel to stay inside `MAX_LIVE_PANELS`. */
function dismissPanelFromWorkspace(world: World, panelId: string): void {
  if (isPanelDockedIn(world, panelId)) {
    detachDockedLeaf(world, panelId);
  }

  getJarvisPanelsPresenter(world).dismissPanel(panelId);
}

/** `readStateNow`'s fallback for the nav machine — never observed in practice
 * (`createWorkspaceNavMachine`'s state$ is warm and defaulted), but the read
 * needs a total type. Mirrors the machine's own INITIAL. */
const FALLBACK_NAV_STATE: WorkspaceNavState = { activeTab: "fx" };

/** The REAL `CandleSeriesPresenter`, one shared instance PER WORLD (same
 * per-World-singleton doctrine as `getLayoutFor`/`getWorkspaceNav` above) —
 * built over a `MarketDataPort`-shaped wrapper of the World's own candle
 * subjects/`candleHistory` fake, so `loadOlderCandles`/`useCandleBackfill`
 * below drive the SAME single-flight/exhaustion state machine production
 * does, through the World's spy-able `candleHistory` (ChartCompare.contract
 * .spec.ts's "ChartPanel pages only the primary…" case spies on it) —
 * mirrors the react driver's own `getCandleSeries`. Only `candles()`/
 * `candleHistory()` are ever actually called by the presenter; `quotes()`/
 * `depth()` are wired for interface completeness via `as unknown` casts
 * (the World's per-symbol subjects are nullable ahead of first data, a
 * shape the presenter never touches). */
const candleSeriesPresenters = new WeakMap<World, CandleSeriesPresenter>();

function getCandleSeries(world: World): CandleSeriesPresenter {
  let presenter = candleSeriesPresenters.get(world);

  if (!presenter) {
    const port: MarketDataPort = {
      watchlist: () => {
        return world.watchlist;
      },
      quotes: (symbol: string) => {
        return world.equityQuoteFor(
          symbol,
        ) as unknown as Observable<EquityQuote>;
      },
      candles: (symbol: string) => {
        return world.candlesFor(symbol);
      },
      candleHistory: (
        symbol: string,
        timeframe: CandleTimeframe,
        beforeTime: number,
        count: number,
      ) => {
        return world.candleHistory(symbol, timeframe, beforeTime, count);
      },
      depth: (symbol: string) => {
        return world.depthFor(symbol) as unknown as Observable<DepthBook>;
      },
    };

    presenter = new CandleSeriesPresenter(port);
    candleSeriesPresenters.set(world, presenter);
  }

  return presenter;
}

/** `getCandleBridge`'s combined loadingOlder/historyExhausted snapshot —
 * named (not inlined) per `no-restricted-syntax`'s ban on inline object type
 * arguments. */
interface CandleBridgeBackfill {
  readonly loadingOlder: boolean;
  readonly historyExhausted: boolean;
}

/** A candle series' rendered value plus its backfill flags, mirrored into
 * plain `BehaviorSubject`s kept warm for the World's lifetime (then wrapped
 * as Solid accessors via `wrapSubject`) — see `getCandleBridge` for why a
 * churn-free subscription matters here. */
interface CandleBridge {
  readonly candles$: BehaviorSubject<readonly Candle[]>;
  readonly backfill$: BehaviorSubject<CandleBridgeBackfill>;
}

const candleBridges = new WeakMap<World, Map<string, CandleBridge>>();

/** One subscription-per-(World, symbol|timeframe) to `CandleSeriesPresenter
 * .candles$`/backfill streams, mirrored into permanently-warm
 * `BehaviorSubject`s `wrapSubject` reads through. Deliberately NOT
 * subscribed straight off a per-render Solid primitive: `candles$` wraps a
 * `shareReplay({ refCount: true })` inside a `defer()` that resets the
 * backfill state (older$/exhausted$/latestFirst) on every FRESH
 * subscription — a subscription that churns with the component would tear
 * down and re-establish it repeatedly, silently un-latching
 * `historyExhausted` in between. A single subscribe here, kept alive for
 * the World's lifetime, avoids that churn entirely — mirrors the react
 * driver's own `getCandleBridge`. */
function getCandleBridge(
  world: World,
  symbol: string,
  timeframe?: CandleTimeframe,
): CandleBridge {
  let byKey = candleBridges.get(world);

  if (!byKey) {
    byKey = new Map();
    candleBridges.set(world, byKey);
  }

  const key = `${symbol}|${timeframe ?? ""}`;
  let bridge = byKey.get(key);

  if (!bridge) {
    const presenter = getCandleSeries(world);
    const candles$ = new BehaviorSubject<readonly Candle[]>([]);
    const backfill$ = new BehaviorSubject<CandleBridgeBackfill>({
      loadingOlder: false,
      historyExhausted: false,
    });

    presenter.candles$(symbol, timeframe).subscribe((series) => {
      candles$.next(series);
    });

    combineLatest([
      presenter.loadingOlder$(symbol, timeframe),
      presenter.historyExhausted$(symbol, timeframe),
    ]).subscribe(([loadingOlder, historyExhausted]) => {
      backfill$.next({ loadingOlder, historyExhausted });
    });

    bridge = { candles$, backfill$ };
    byKey.set(key, bridge);
  }

  return bridge;
}

/** The REAL `createJarvisDriverMachine`, one shared instance PER WORLD
 * (Task 12/P5) — mirrors the react driver's own `jarvisDrivers` cache; see
 * that file's doc for the full wiring rationale (same catchError/EMPTY
 * guard on `events$`, same late-bound `outcomes$` → `recordDriveOutcome`
 * subscription). */
const jarvisDrivers = new WeakMap<World, JarvisDriverMachineHandle>();

function getJarvisDriverMachine(world: World): JarvisDriverMachineHandle {
  let driver = jarvisDrivers.get(world);

  if (!driver) {
    const machine = getJarvisMachine(world);
    // Minimal fixture wiring for the pinned-panels round's dockPanel/
    // undockPanel drive commands — delegates to the REAL JarvisPanelsMachine's
    // (`dockPanelIntoWorkspace` & co. above), NOT the raw panels machine's
    // intents — exactly what `composition.ts` hands this machine, and what
    // makes a driven `dockPanel` command observable as a workspace leaf
    // rather than only as a `docked: true` flag. livePanelIds$/
    // dockedPanelIds$ are derived from the presenter's existing panels$ VM
    // stream rather than a second read of the raw machine.
    const panelsPresenter = getJarvisPanelsPresenter(world);
    driver = createJarvisDriverMachine({
      events$: machine.events$.pipe(
        catchError(() => {
          return EMPTY;
        }),
      ),
      workspaceNav: getWorkspaceNav(world),
      layout: (tab: WorkspaceTab) => {
        return getLayoutFor(world, tab);
      },
      eqWorkspace: world.eqWorkspace,
      setThemeSkin: (skin: ThemeSkin) => {
        world.themeSkin.next(skin);
      },
      setPowerSaver: (level: PowerSaverLevel) => {
        world.powerSaverLevel.next(level);
      },
      dismissPanel: (panelId: string) => {
        dismissPanelFromWorkspace(world, panelId);
      },
      dockPanel: (panelId: string) => {
        dockPanelIntoWorkspace(world, panelId);
      },
      undockPanel: (panelId: string) => {
        undockPanelFromWorkspace(world, panelId);
      },
      knownLayoutPanelIds,
      knownSymbols$: world.watchlist.pipe(
        map((list) => {
          return list.map((instrument) => {
            return instrument.symbol;
          });
        }),
      ),
      powerSaverLevel$: world.powerSaverLevel,
      livePanelIds$: panelsPresenter.panels$.pipe(
        map((rows) => {
          return rows.map((row) => {
            return row.panelId;
          });
        }),
      ),
      dockedPanelIds$: panelsPresenter.panels$.pipe(
        map((rows) => {
          return rows
            .filter((row) => {
              return row.docked;
            })
            .map((row) => {
              return row.panelId;
            });
        }),
      ),
    });
    jarvisDrivers.set(world, driver);

    driver.outcomes$.subscribe((outcome: DriveOutcome) => {
      machine.intents.recordDriveOutcome(outcome);
    });
  }

  return driver;
}

/** The REAL `createJarvisDemoMachine`, one shared instance PER WORLD —
 * mirrors the react driver's own `jarvisDemos` cache; see that file's doc
 * for the full wiring rationale (same catchError/EMPTY guard on
 * `events$`, `jarvis.intents` narrowed to the four members the demo
 * actually drives). */
const jarvisDemos = new WeakMap<World, JarvisDemoMachineHandle>();

function getJarvisDemoMachine(world: World): JarvisDemoMachineHandle {
  let demo = jarvisDemos.get(world);

  if (!demo) {
    const machine = getJarvisMachine(world);
    demo = createJarvisDemoMachine({
      jarvisState$: machine.state$,
      jarvisEvents$: machine.events$.pipe(
        catchError(() => {
          return EMPTY;
        }),
      ),
      jarvis: machine.intents,
      powerSaverLevel$: world.powerSaverLevel,
    });
    jarvisDemos.set(world, demo);
  }

  return demo;
}

/** The REAL `JarvisPanelsPresenter` (Task 9), one shared instance PER WORLD
 * — cached like `getJarvisMachine` above, fed by that same cached machine's
 * `events$` (mirrors `composition.ts`'s own catchError/EMPTY guard, required
 * since `createJarvisPanelsMachine`'s `events$` input is TERMINAL on error).
 * Read directly with `toSignal(state(...))` at each call site below — no
 * extra warm-BehaviorSubject bridge needed here (unlike the react driver's
 * sibling fixture, which has no `@rx-state/core` dependency to reach for):
 * `state(source$, default)` always emits synchronously on subscribe (the
 * default if the source doesn't emit synchronously itself), so `toSignal`
 * never throws even before this presenter's own panels have ticked. */
const jarvisPanelsPresenters = new WeakMap<World, JarvisPanelsPresenter>();

/** The raw panels MACHINE behind `getJarvisPanelsPresenter`'s presenter, kept
 * per World so the driver fixture can reach `dockPanel`/`undockPanel`: the
 * presenter deliberately does not re-export those intents (docking is only
 * half a panels-machine operation — see its class doc), exactly as
 * composition.ts holds the handle itself for the same reason. */
const jarvisPanelsMachines = new WeakMap<World, JarvisPanelsMachineHandle>();

/** A World's CURRENT raw panel rows, held in a mutable cell so the writer and
 * the dock bridges read the same live value. `JarvisPanelVm` drops the spec,
 * and both the bridges (is this id docked right now?) and the persistence
 * writer (what spec does this docked panel carry?) need it — composition's
 * own `latestPanels` session-lifetime mirror. */
interface PanelInstancesCell {
  current: readonly PanelInstance[];
}

const panelInstances = new WeakMap<World, PanelInstancesCell>();

/** The rows, CREATING this World's panels machine if it has none yet (the
 * dock bridges' read; `dockedPlacementsFor` deliberately does not). */
function panelInstancesFor(world: World): readonly PanelInstance[] {
  getJarvisPanelsMachine(world);
  return panelInstances.get(world)?.current ?? [];
}

function getJarvisPanelsMachine(world: World): JarvisPanelsMachineHandle {
  let machine = jarvisPanelsMachines.get(world);

  if (!machine) {
    machine = createJarvisPanelsMachine(
      getJarvisMachine(world).events$.pipe(
        catchError(() => {
          return EMPTY;
        }),
      ),
    );
    jarvisPanelsMachines.set(world, machine);

    // Session-lifetime mirror of the raw fold (composition's `latestPanels`),
    // plus the writer kick. `map` + `distinctUntilChanged` on the panels
    // ARRAY, not the state object: every intent produces a fresh state object
    // even when its reducer was a no-op, so subscribing to `state$` directly
    // would persist on a REJECTED dock of an unknown id.
    const cell: PanelInstancesCell = { current: [] };
    panelInstances.set(world, cell);
    machine.state$.subscribe((panelsState) => {
      cell.current = panelsState.panels;
    });

    const dock = getWorkspaceDock(world);
    machine.state$
      .pipe(
        map((panelsState) => {
          return panelsState.panels;
        }),
        distinctUntilChanged(),
        skip(1),
      )
      .subscribe(() => {
        dock.kick$.next();
      });

    // Boot rehydration: re-admit every persisted docked panel to the roster
    // (their LEAVES arrive separately, already in each tab's seeded tree —
    // see `getLayoutFor`), and restore the tab attribution the writer
    // persists by.
    for (const tab of FIXTURE_WORKSPACE_TABS) {
      const persistedTab = dock.persisted?.tabs[tab];

      if (!persistedTab) {
        continue;
      }

      for (const entry of persistedTab.docked) {
        machine.restoreDockedPanel(entry.panelId, entry.spec);
        dock.dockedTabs.set(entry.panelId, tab);
      }
    }
  }

  return machine;
}

function getJarvisPanelsPresenter(world: World): JarvisPanelsPresenter {
  let presenter = jarvisPanelsPresenters.get(world);

  if (!presenter) {
    presenter = new JarvisPanelsPresenter(
      getJarvisPanelsMachine(world),
      world.panelStreamDeps,
    );
    jarvisPanelsPresenters.set(world, presenter);
  }

  return presenter;
}

/** `Presenters.resetWorkspaceLayout` — clears the stored string, forgets the
 * boot snapshot (so a tab opened later cannot resurrect it), returns every
 * CREATED layout machine to its default tree, and dismisses every docked
 * panel. The reset's own state changes still kick the writer, so the next
 * write re-persists the now-default, docked-free workspace rather than
 * leaving the cleared preference and live state disagreeing. */
function resetWorkspaceLayoutFor(world: World): void {
  world.workspaceLayout.next(null);
  const dock = getWorkspaceDock(world);
  dock.persisted = null;

  const byTab = layoutHandles.get(world);

  if (byTab) {
    for (const machine of byTab.values()) {
      machine.intents.reset();
    }
  }

  const presenter = getJarvisPanelsPresenter(world);

  for (const panel of panelInstancesFor(world)) {
    if (panel.docked) {
      presenter.dismissPanel(panel.panelId);
    }
  }

  dock.dockedTabs.clear();
}

/** Build a reactive ViewModel backed by the neutral World — the Solid
 * counterpart of the react driver's `reactViewModel`. Member-by-member this
 * mirrors that file (same World, same machine factories, same command
 * bookkeeping); only the accessor mechanics differ: React re-renders the
 * whole hook body on each `useSyncExternalStore` push, Solid instead hands
 * back a stable `Accessor` per member (`wrapSubject`/`toSignal`) that stays
 * reactive across the member's whole lifetime without re-invoking this
 * factory. */
export function solidViewModel(world: World): ViewModel {
  const s = world.sources;

  // Dock-layout store: world-scoped (not module-level), so each World built
  // by a spec gets its own fresh store — mirrors the real
  // Presenters.dockLayoutStore's per-app-instance lifetime, and the react
  // driver's own world-scoped dockStore.
  const dockStore = new InMemoryDockLayoutStore();

  // Stable per-mount signals backing the two hand-rolled submission fakes
  // below (NewRfqPanel / TradeTicket haven't grown a real app-layer machine
  // yet — mirrors the react driver's useState-backed fakes). `useRfqSubmission`
  // / `useTicketSubmission` are each called once per component instance that
  // reads them (a plain function call, unlike React's per-render hook
  // bookkeeping), so a fresh `createSignal` per call is the correct Solid
  // shape — the same "factory runs once" reasoning `useMachine` documents.
  function useRfqSubmission(): UseRfqSubmissionFake {
    const [submissionState, setSubmissionState] =
      createSignal<RfqSubmissionState>({ status: "editing" });

    function submit(
      input: CreateRfqInput,
      onRedirect: (rfqId: number) => void,
    ): void {
      world.commands.createRfq.push(input);
      setSubmissionState({ status: "submitting" });

      // Mirror the real machine, where submitting is emitted synchronously and
      // confirmed only arrives after the async create-RFQ RPC resolves. With no
      // seeded result the submission stays in flight; when a result IS seeded
      // the fake confirms in the same tick (editing → confirmed) as before.
      const rfqId = world.results.createRfq;

      if (rfqId === undefined) {
        return;
      }

      setSubmissionState({ status: "confirmed", rfqId });
      setTimeout(() => {
        onRedirect(rfqId);
        setSubmissionState({ status: "editing" });
      }, REDIRECT_DELAY_MS);
    }

    return { state: submissionState, submit };
  }

  function useTicketSubmission(): UseTicketSubmissionFake {
    const [ticketState, setTicketState] = createSignal<TicketSubmissionState>({
      submitted: false,
    });

    function submitPrice(quoteId: number, price: number): void {
      world.commands.quoteRfq.push({ quoteId, price });
      setTicketState({ submitted: true });
    }

    function pass(quoteId: number): void {
      world.commands.passQuote.push(quoteId);
      setTicketState({ submitted: true });
    }

    return { state: ticketState, submitPrice, pass };
  }

  return {
    // Parametric query streams: each call wraps the World's per-key subject,
    // so a tile reading usePrice("EURUSD") re-renders only when that symbol
    // is pushed — mirroring the real ViewModel's `state()`-factory binds.
    usePrice: (pair: CurrencyPair) => {
      return wrapSubject(world.priceFor(pair.symbol));
    },
    usePriceHistory: (symbol: string) => {
      return wrapSubject(world.historyFor(symbol));
    },
    useQuotesForRfq: (rfqId: number) => {
      return wrapSubject(world.quotesForRfq(rfqId));
    },
    // Nullary query streams.
    useTrades: () => {
      return wrapSubject(s.useTrades);
    },
    // New-trade flagging lives in the presenter (not pinned by contract
    // specs); the fake reports no rows as new.
    useNewTradeIds: () => {
      const empty: ReadonlySet<number> = new Set();

      return () => {
        return empty;
      };
    },
    // The Activity feed's live/seed split and receipt-time stamping live in
    // the presenter (BlotterPresenter.activity$, not pinned by contract
    // specs) — specs inject the already-derived entries directly, the same
    // way they inject useTrades.
    useActivity: () => {
      return wrapSubject(s.useActivity);
    },
    useAnalytics: () => {
      return wrapSubject(s.useAnalytics);
    },
    useRfqs: () => {
      return wrapSubject(s.useRfqs);
    },
    useAllQuotes: () => {
      return wrapSubject(s.useAllQuotes);
    },
    useCurrencyPairs: () => {
      return wrapSubject(s.useCurrencyPairs);
    },
    useInstruments: () => {
      return wrapSubject(s.useInstruments);
    },
    useDealers: () => {
      return wrapSubject(s.useDealers);
    },
    useConnectionStatus: () => {
      return wrapSubject(s.useConnectionStatus);
    },
    // Commands: record input, resolve once — mirrors the real bridge's
    // `firstValueFrom` shape without needing a presenter Observable.
    useAcceptQuote: () => {
      return async (quoteId: number) => {
        world.commands.acceptQuote.push(quoteId);
      };
    },
    useCancelRfq: () => {
      return async (rfqId: number) => {
        world.commands.cancelRfq.push(rfqId);
      };
    },
    useReconnect: () => {
      return () => {
        world.commands.reconnect += 1;
      };
    },
    // Machines: the REAL createTileExecutionMachine, driven by a World-backed
    // execute() dep that records inputs and emits the canned result (or errors
    // to drive the timeout-confirmation path) — exercising the relocated
    // lifecycle through the same useMachine bridge the app uses.
    useTileExecution: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createTileExecutionMachine(pair, {
          execute: (input: ExecuteTradeInput) => {
            world.commands.executeTrade.push(input);

            if (world.results.executeTradeThrows) {
              return throwError(() => {
                return new Error("execute failed");
              }) as Observable<ExecuteTradeResult>;
            }

            const result = world.results.executeTrade;
            return result
              ? of(result)
              : (EMPTY as Observable<ExecuteTradeResult>);
          },
        });
      });
    },
    // Machine: the REAL createRfqTileMachine, driven by a World-backed
    // request-quote dep, exercising the relocated RFQ lifecycle through the
    // same useMachine bridge the app uses.
    useRfqTile: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createRfqTileMachine(pair, {
          requestQuote: (symbol: string, pipsPosition: number) => {
            world.commands.requestRfqQuote.push({ symbol, pipsPosition });

            if (world.results.requestRfqQuoteThrows) {
              return throwError(() => {
                return new Error("rfq failed");
              }) as Observable<RfqQuoteResult>;
            }

            const result = world.results.requestRfqQuote;
            return result ? of(result) : (EMPTY as Observable<RfqQuoteResult>);
          },
        });
      });
    },
    // Intent-free derived flags: the REAL createStaleFlagMachine, sourced
    // from the World's connection-status subject and the per-key price /
    // analytics subjects.
    useStaleFlag: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: world.priceFor(pair.symbol),
        });
      }).state;
    },
    useAnalyticsStaleFlag: () => {
      return useMachine(() => {
        return createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: s.useAnalytics,
        });
      }).state;
    },
    // Intent-free derived flag: the REAL createRowHighlightMachine — the
    // contract spec drives the 3s fade with fake timers, exercised through
    // the same useMachine bridge the app uses.
    useRowHighlight: (isNew: boolean) => {
      return useMachine(() => {
        return createRowHighlightMachine(isNew);
      }).state;
    },
    // Machine: the REAL createNotionalMachine.
    useNotional: (defaultNotional: number) => {
      return useMachine(() => {
        return createNotionalMachine(defaultNotional);
      });
    },
    // Submission machine fakes (see the two closures defined above this
    // return block).
    useRfqSubmission,
    useTicketSubmission,
    // Global throughput: reactive view backed by the World subject; setValue
    // records the value and optimistically echoes it into the view
    // (mirroring the presenter's immediate echo).
    useThroughput: () => {
      const view = wrapSubject(world.throughput);
      return {
        value: () => {
          return view().value;
        },
        loading: () => {
          return view().loading;
        },
        message: () => {
          return view().message;
        },
        setValue: (value: number) => {
          world.throughputSets.push(value);
          world.setThroughputView({ value });
        },
      };
    },
    // Global theme mode: reactive view backed by the World subject. The
    // subject holds the stored PREFERENCE (dark | light | system); `mode` is
    // resolved for painting and `cycle` advances the preference through the
    // seam. The harness has no OS media query, so "system" resolves
    // deterministically to dark.
    useThemePreference: () => {
      const modePreference = wrapSubject(world.themeMode);
      return {
        mode: () => {
          return resolveThemeMode(modePreference(), true);
        },
        modePreference,
        cycle: () => {
          // Read the CURRENT value (not a captured one) so rapid clicks each
          // advance from the true state, mirroring the real presenter's cycle().
          world.themeMode.next(
            nextThemeModePreference(world.themeMode.getValue()),
          );
        },
      };
    },
    // Global theme skin: reactive view backed by the World subject; setSkin
    // pushes back so a change through the seam repaints the skin.
    useThemeSkinPreference: () => {
      return {
        skin: wrapSubject(world.themeSkin),
        setSkin: (next: ThemeSkin) => {
          world.themeSkin.next(next);
        },
      };
    },
    // Animated background: reactive boolean backed by the World subject;
    // setEnabled/toggle push back, and each written value is recorded so a
    // spec can assert the seam was written.
    useAnimatedBackground: () => {
      const enabled = wrapSubject(world.animatedBackground);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.animatedBackgroundSets.push(on);
          world.animatedBackground.next(on);
        },
        toggle: () => {
          const next = !enabled();
          world.commands.animatedBackgroundSets.push(next);
          world.animatedBackground.next(next);
        },
      };
    },
    // Power saver: reactive 3-state level (off/calm/freeze) backed by the
    // World subject; setLevel/cycle push back so a click through the seam
    // advances the rendered level, and each written level is recorded,
    // mirroring useAnimatedBackground.
    usePowerSaver: () => {
      const level = wrapSubject(world.powerSaverLevel);
      return {
        level,
        isCalm: () => {
          return level() !== "off";
        },
        isFreeze: () => {
          return level() === "freeze";
        },
        setLevel: (next: PowerSaverLevel) => {
          world.commands.powerSaverLevelSets.push(next);
          world.powerSaverLevel.next(next);
        },
        cycle: () => {
          const next = nextPowerSaverLevel(level());
          world.commands.powerSaverLevelSets.push(next);
          world.powerSaverLevel.next(next);
        },
      };
    },
    // Ambient style: reactive view backed by the World subject (mirrors
    // useThemeSkinPreference above); setStyle pushes back so a click through
    // the seam (PreferencesModal's "Ambient style" segment) flips the
    // rendered AmbientBackground branch. Mirrors the react driver's
    // useAmbientStyle exactly.
    useAmbientStyle: () => {
      return {
        style: wrapSubject(world.ambientStyle),
        setStyle: (next: AmbientStyle) => {
          world.ambientStyle.next(next);
        },
      };
    },
    // Chart substrate: reactive view backed by the World subject (mirrors
    // useAmbientStyle above); setSubstrate pushes back so a click through the
    // seam (PreferencesModal's "Chart renderer" segment) flips the value.
    // Mirrors the react driver's useChartSubstrate exactly.
    useChartSubstrate: () => {
      return {
        substrate: wrapSubject(world.chartSubstrate),
        setSubstrate: (next: ChartSubstrate) => {
          world.chartSubstrate.next(next);
        },
      };
    },
    // Layout engine: reactive view backed by the World subject (mirrors
    // useChartSubstrate above); setEngine pushes back so a click through the
    // seam (PreferencesModal's "Layout engine" segment) flips the value.
    // Mirrors the react driver's useLayoutEngine exactly.
    useLayoutEngine: () => {
      return {
        engine: wrapSubject(world.layoutEngine),
        setEngine: (next: LayoutEngine) => {
          world.layoutEngine.next(next);
        },
      };
    },
    // Dock-layout store: plain passthrough (no rx) — the store itself is not
    // a stream, so no wrapSubject here, unlike every preference hook above.
    // Mirrors the react driver's useDockLayoutStore exactly.
    useDockLayoutStore: () => {
      return dockStore;
    },
    // Global force-boot-animation preference: reactive flag backed by the World
    // subject; setEnabled/toggle push back so a click through the seam flips
    // the rendered flag, and each written value is recorded, mirroring usePowerSaver.
    useForceBootAnimation: () => {
      const enabled = wrapSubject(world.forceBootAnimation);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.forceBootAnimationSets.push(on);
          world.forceBootAnimation.next(on);
        },
        toggle: () => {
          const next = !enabled();
          world.commands.forceBootAnimationSets.push(next);
          world.forceBootAnimation.next(next);
        },
      };
    },
    // The two login-wait inspection preferences, same seam shape: reactive
    // reads off the World subjects, writes recorded so a spec can assert what
    // the user actually chose.
    useLoginWaitPreferences: () => {
      return {
        style: wrapSubject(world.loginWaitStyle),
        setStyle: (style: LoginWaitStyle) => {
          world.commands.loginWaitStyleSets.push(style);
          world.loginWaitStyle.next(style);
        },
        delay: wrapSubject(world.loginWaitDelay),
        setDelay: (delay: LoginWaitDelay) => {
          world.commands.loginWaitDelaySets.push(delay);
          world.loginWaitDelay.next(delay);
        },
      };
    },
    // Global view-mode: reactive view backed by the World subject; setViewMode
    // pushes back so a toggle through the seam flips the rendered mode.
    useViewModePreference: () => {
      return {
        viewMode: wrapSubject(world.viewMode),
        setViewMode: (next: ViewMode) => {
          world.viewMode.next(next);
        },
      };
    },
    // Credit RFQs filter: reactive view backed by the World subject.
    useCreditRfqFilterPreference: () => {
      return {
        filter: wrapSubject(world.creditRfqFilter),
        setFilter: (next: CreditRfqFilter) => {
          world.setCreditRfqFilter(next);
        },
      };
    },
    // Equities watchlist sort: reactive view backed by the World subject;
    // cycle() reads the CURRENT value (not a captured one) so rapid clicks
    // each advance from the true state.
    useEqWatchlistSort: () => {
      const sort = wrapSubject(world.eqWatchlistSort);
      return {
        sort,
        setSort: (next: EqWatchlistSort) => {
          world.eqWatchlistSort.next(next);
        },
        cycle: () => {
          world.eqWatchlistSort.next(
            nextEqWatchlistSort(world.eqWatchlistSort.getValue()),
          );
        },
      };
    },
    // Equities blotter tab: reactive view backed by the World subject.
    useEqBlotterView: () => {
      return {
        view: wrapSubject(world.eqBlotterView),
        setView: (next: EqBlotterView) => {
          world.eqBlotterView.next(next);
        },
      };
    },
    // Auth: reactive state backed by the World subject; login/unlock/lock/logout
    // push back so the seam transition re-renders LoginScreen/LockScreen, mirroring
    // AuthPresenter's lifecycle just closely enough for component specs.
    useAuth: () => {
      const authState = wrapSubject(world.auth);
      return {
        state: authState,
        login: (username: string, password: string) => {
          world.commands.authLoginArgs.push([username, password]);
        },
        unlock: (password: string) => {
          world.commands.authUnlock += 1;
          world.commands.authUnlockArgs.push(password);
          world.auth.next({
            ...world.auth.getValue(),
            locked: false,
            error: null,
          });
        },
        lock: () => {
          world.commands.authLock += 1;
          world.auth.next({ ...world.auth.getValue(), locked: true });
        },
        logout: () => {
          world.commands.authLogout += 1;
          world.auth.next({
            status: "unauthenticated",
            user: null,
            locked: false,
            unlocking: false,
            error: null,
            waitVariant: "handshake",
          });
        },
      };
    },
    // Boot gate: reactive visibility backed by the World subject; reboot
    // re-raises (recorded so a spec can assert "⟳ Reboot HUD fires once"),
    // dismiss lowers — mirroring the real BootGatePresenter seam.
    useBootGate: () => {
      const visible = wrapSubject(world.bootGate);
      return {
        visible,
        reboot: () => {
          world.commands.bootReboot += 1;
          world.bootGate.next(true);
        },
        dismiss: () => {
          world.bootGate.next(false);
        },
      };
    },
    // Per-RFQ countdown: the REAL createRfqCountdownMachine, exercising the
    // relocated countdown logic through the same useMachine bridge the app
    // uses. Contract specs drive the countdown with fake timers.
    useRfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return useMachine(() => {
        return createRfqCountdownMachine(creationTimestamp, totalMs);
      }).state;
    },
    // Animation intents: backed by the World's per-target intent subject so
    // the AnimationIntents.contract.spec can push synthetic intents and
    // assert the data-anim mapping without wiring a real AnimationDirector.
    useAnimationIntents: (target: string) => {
      return wrapSubject(world.intentFor(target));
    },
    // Layout: the REAL per-tab createLayoutMachine SINGLETON (Task 12/P5,
    // getLayoutFor above) rather than a fresh per-mount instance — a driven
    // "layout" DriveCommand and a mounted AppShell's own useLayout(tab) now
    // read/write the SAME machine, mirroring composition.ts's layoutFor.
    useLayout: (tab: WorkspaceTab) => {
      const machine = getLayoutFor(world, tab);
      return { state: toSignal(machine.state$), ...machine.intents };
    },
    // Reset workspace layout (Preferences → DATA & PRIVACY): see
    // resetWorkspaceLayoutFor's doc — the REAL Presenters.resetWorkspaceLayout
    // shape, persisted preference included.
    useWorkspaceReset: () => {
      return () => {
        resetWorkspaceLayoutFor(world);
      };
    },
    // Boot sequence: no contract spec exercises the boot sequence beyond its
    // own BootSequence.contract.spec.ts (Task 9); use the REAL machine with a
    // fixed "core" variant and noop advance so it compiles and disposes
    // cleanly without touching real preferences.
    useBootSequence: (onDone: () => void) => {
      return useMachine(() => {
        return createBootSequenceMachine({
          variant: "core",
          advance: (): void => {},
          onDone,
        });
      });
    },
    // Equities: reactive views backed by the World's shared streams
    // (watchlist / orders / positions) and per-symbol subjects
    // (quote / candles / depth).
    useWatchlist: () => {
      return wrapSubject(world.watchlist);
    },
    useEquityQuote: (symbol: string) => {
      return wrapSubject(world.equityQuoteFor(symbol));
    },
    // Candles + backfill route through the REAL `CandleSeriesPresenter`
    // (getCandleBridge/getCandleSeries above) — ChartCompare.contract.spec
    // .ts's "ChartPanel pages only the primary…" case drives a real
    // near-edge trigger through ChartPanel and spies on the World's
    // `candleHistory`, so `loadOlderCandles` must reach it for real rather
    // than stay the no-op stub this used to be (ChartBackfill.contract.spec
    // .ts still covers the trigger's own logic by mounting CandleChart
    // directly with props) — mirrors the react driver's own wiring.
    useCandles: (symbol: string, timeframe?: CandleTimeframe) => {
      return wrapSubject(getCandleBridge(world, symbol, timeframe).candles$);
    },
    useCandleBackfill: (symbol: string, timeframe?: CandleTimeframe) => {
      return wrapSubject(getCandleBridge(world, symbol, timeframe).backfill$);
    },
    loadOlderCandles: (symbol: string, timeframe?: CandleTimeframe): void => {
      getCandleSeries(world).loadOlder(symbol, timeframe);
    },
    useDepth: (symbol: string) => {
      return wrapSubject(world.depthFor(symbol));
    },
    useEquityOrders: () => {
      return wrapSubject(world.equityOrders);
    },
    useEquityPositions: () => {
      return wrapSubject(world.equityPositions);
    },
    // Machine: the REAL createOrderTicketMachine, driven by a World-backed
    // place() that returns the lifecycle Subject.
    useOrderTicket: (defaultSymbol: string) => {
      return useMachine(() => {
        return createOrderTicketMachine({
          place: (req: PlaceOrderRequest) => {
            world.commands.placedOrderRequests.push(req);
            return world.orderLifecycle.asObservable();
          },
          defaultSymbol,
        });
      });
    },
    // Eq workspace: the REAL createEqWorkspaceMachine, one shared instance
    // for the whole World (world.eqWorkspace) — its `state$` is already a
    // warm StateObservable (see @rtc/client-core's Machine interface), so it
    // is read directly with `toSignal`, exactly like `@rtc/solid-bindings`'s
    // own createViewModel reads `presenters.eqWorkspace.state$` — NOT a
    // per-mount useMachine, so every component reading useEqWorkspace()
    // through this World observes the same selection/open-tabs/timeframe.
    useEqWorkspace: () => {
      return {
        state: toSignal(world.eqWorkspace.state$),
        select: world.eqWorkspace.intents.select,
        closeTab: world.eqWorkspace.intents.closeTab,
        setTimeframe: world.eqWorkspace.intents.setTimeframe,
        setChartType: world.eqWorkspace.intents.setChartType,
        toggleIndicator: world.eqWorkspace.intents.toggleIndicator,
        togglePane: world.eqWorkspace.intents.togglePane,
        toggleYScale: world.eqWorkspace.intents.toggleYScale,
        setCompare: world.eqWorkspace.intents.setCompare,
      };
    },
    // The app's active workspace tab (Task 12/P5): the REAL
    // createWorkspaceNavMachine SINGLETON (getWorkspaceNav above), mirroring
    // composition.ts's promoted workspaceNav — reachable now from a driven
    // "switchTab" command, and shared by every component reading
    // useWorkspaceNav() through this World (e.g. a mounted AppShell).
    useWorkspaceNav: () => {
      const machine = getWorkspaceNav(world);
      return {
        state: toSignal(machine.state$),
        switchTab: machine.intents.switchTab,
      };
    },
    // Eq drawings: the REAL createEqDrawingsMachine, one shared instance for
    // the whole World (world.eqDrawings) — its `state$` is already a warm
    // StateObservable (see @rtc/client-core's Machine interface), so it is
    // read directly with `toSignal`, exactly like `useEqWorkspace` above —
    // NOT a per-mount useMachine, so the chart head's draw-tool pills and
    // the plot's committed drawings, even mounted via separate mountWith()
    // calls sharing one World, observe the same tool/drawings/selection.
    useEqDrawings: () => {
      return {
        state: toSignal(world.eqDrawings.state$),
        setTool: world.eqDrawings.intents.setTool,
        addDrawing: world.eqDrawings.intents.addDrawing,
        selectDrawing: world.eqDrawings.intents.selectDrawing,
        deleteSelected: world.eqDrawings.intents.deleteSelected,
        shiftAnchors: world.eqDrawings.intents.shiftAnchors,
        updateDrawing: world.eqDrawings.intents.updateDrawing,
      };
    },
    // Jarvis: the REAL createJarvisMachine (Task 9), cached once per World
    // (getJarvisMachine above) and read directly with `toSignal` — its
    // `state$` is already a warm StateObservable (see @rtc/client-core's
    // Machine interface), exactly like `useEqWorkspace` above — so a
    // co-mounted JarvisOrb + JarvisOverlay, even mounted via separate
    // mountWith() calls sharing one World, observe the same open/phase/
    // entries/pendingConfirmation.
    useJarvis: () => {
      const machine = getJarvisMachine(world);
      return { state: toSignal(machine.state$), ...machine.intents };
    },
    // The two Jarvis desk-assistant preferences (Task 10): reactive reads
    // off World.jarvisBrain/jarvisEffort, writes recorded so a spec can
    // assert what the user actually chose — mirrors useLoginWaitPreferences
    // exactly, and feeds the SAME subjects getJarvisMachine's
    // preferredBrain$/effort$ read above, so a write through this seam
    // re-resolves the real machine's effectiveBrain.
    useJarvisPreferences: () => {
      return {
        brain: wrapSubject(world.jarvisBrain),
        setBrain: (brain: JarvisBrain) => {
          world.commands.jarvisBrainSets.push(brain);
          world.jarvisBrain.next(brain);
        },
        effort: wrapSubject(world.jarvisEffort),
        setEffort: (effort: JarvisEffort) => {
          world.commands.jarvisEffortSets.push(effort);
          world.jarvisEffort.next(effort);
        },
        narrator: wrapSubject(world.jarvisNarrator),
        setNarrator: (preference: JarvisNarratorPreference) => {
          world.commands.jarvisNarratorSets.push(preference);
          world.jarvisNarrator.next(preference);
        },
      };
    },
    // Admin / telemetry: World-backed fakes that re-render subscribing
    // components when the test pushes new data. The incident fake mirrors
    // the real IncidentMachine's connection-status asymmetry via
    // world.injectIncident.
    useMetrics: () => {
      const view = wrapSubject(world.metrics$);
      return {
        throughput: () => {
          return view().throughput;
        },
        latency: () => {
          return view().latency;
        },
        errorRate: () => {
          return view().errorRate;
        },
      };
    },
    // Jarvis token-usage/cost telemetry (Task 10): reactive view backed by
    // the World subject, mirroring useTopology.
    useJarvisUsage: () => {
      return wrapSubject(world.jarvisUsage$);
    },
    // Generative-UI desk panels (Task 9): the REAL JarvisPanelsPresenter,
    // fed by the same jarvis.events$ the REAL JarvisMachine above emits —
    // see getJarvisPanelsPresenter's doc for the full wiring. dockedPanels/
    // floatingPanels mirror JarvisPanelsPresenter.dockedPanels$/
    // floatingPanels$ directly (the presenter already exposes the
    // pre-split streams); dismissPanel/dockPanel/undockPanel are the
    // LAYOUT-TREE-INTEGRATED bridges (`Presenters.dismissPanel`/`dockPanel`/
    // `undockPanel`), so a pin from the floating card's 📌 really does insert
    // a leaf into the active tab.
    useJarvisPanels: () => {
      const presenter = getJarvisPanelsPresenter(world);
      return {
        panels: toSignal(
          state(presenter.panels$, [] as readonly JarvisPanelVm[]),
        ),
        dockedPanels: toSignal(
          state(presenter.dockedPanels$, [] as readonly JarvisPanelVm[]),
        ),
        floatingPanels: toSignal(
          state(presenter.floatingPanels$, [] as readonly JarvisPanelVm[]),
        ),
        dismissPanel: (panelId: string) => {
          dismissPanelFromWorkspace(world, panelId);
        },
        dockPanel: (panelId: string) => {
          dockPanelIntoWorkspace(world, panelId);
        },
        undockPanel: (panelId: string) => {
          undockPanelFromWorkspace(world, panelId);
        },
      };
    },
    useJarvisPanelData: (panelId: string) => {
      const presenter = getJarvisPanelsPresenter(world);
      return toSignal(
        state(presenter.panelData$(panelId), null as PanelData | null),
      );
    },
    // Jarvis drive-the-app interpreter's outcomes (Task 12/P5): the REAL
    // createJarvisDriverMachine (getJarvisDriverMachine above), one shared
    // instance per World — a driven batch's lastBatch is now genuinely
    // observable, including by HeaderChrome's/AppShell's own driven-pulse
    // cue (useJarvisDrivenPulse.ts).
    useJarvisDriver: (): Accessor<JarvisDriverState> => {
      const driver = getJarvisDriverMachine(world);
      return toSignal(driver.state$);
    },
    useJarvisDemo: () => {
      const demo = getJarvisDemoMachine(world);
      return {
        state: toSignal(demo.state$),
        ...demo.intents,
      };
    },
    useTopology: () => {
      return wrapSubject(world.topology$);
    },
    useEventLog: () => {
      return wrapSubject(world.eventLog$);
    },
    useSessions: () => {
      return wrapSubject(world.sessions$);
    },
    useSessionCountSeries: () => {
      return wrapSubject(world.sessionCountSeries$);
    },
    useIncident: () => {
      return {
        state: wrapSubject(world.incidentState$),
        inject: (kind: Parameters<typeof world.injectIncident>[0]) => {
          world.injectIncident(kind);
        },
        clear: () => {
          world.clearIncident();
        },
      };
    },
  };
}
