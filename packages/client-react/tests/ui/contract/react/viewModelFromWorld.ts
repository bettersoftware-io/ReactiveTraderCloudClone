import {
  CORE_OPTIONS_FOR_TESTS,
  type JarvisWorld,
  type World,
} from "@ui-contract/harness/world";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  BehaviorSubject,
  combineLatest,
  EMPTY,
  merge,
  type Observable,
  of,
  Subject,
  throwError,
} from "rxjs";
import { catchError, distinctUntilChanged, map, skip } from "rxjs/operators";

import {
  CandleSeriesPresenter,
  createBootSequenceMachine,
  createJarvisDemoMachine,
  createJarvisDriverMachine,
  createJarvisMachine,
  createJarvisPanelsMachine,
  createLayoutMachine,
  createLayoutPresets,
  createNotionalMachine,
  createOrderTicketMachine,
  createRfqCountdownMachine,
  createRfqTileMachine,
  createRowHighlightMachine,
  createStaleFlagMachine,
  createTileExecutionMachine,
  createWorkspaceNavMachine,
  createWorkspacePersistenceWriter,
  JarvisPanelsPresenter,
} from "@rtc/client-core-rxjs";
import type {
  CoreImpl,
  DockLayoutStore,
  DriveOutcome,
  JarvisDemoMachineHandle,
  JarvisDriverMachineHandle,
  JarvisMachineHandle,
  JarvisPanelsMachineHandle,
  JarvisPanelsState,
  JarvisPanelVm,
  LayoutIntents,
  LayoutNode,
  LayoutPresetStore,
  LayoutPresetSummary,
  LayoutPresetsPresenter,
  LayoutState,
  Machine,
  PanelData,
  PanelInstance,
  RfqCountdownSeed,
  RfqSubmissionState,
  SaveLayoutPresetOptions,
  TicketSubmissionState,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import {
  createDefaultLayoutPort,
  createWorkspaceDock,
  InMemoryDockLayoutStore,
  InMemoryLayoutPresetStore,
  type WorkspaceDock,
  type WorkspaceDockPanels,
} from "@rtc/core-logic";
import {
  type AmbientStyle,
  type Candle,
  type CandleTimeframe,
  type ChartSubstrate,
  type CreateRfqInput,
  type CreditRfqFilter,
  type CurrencyPair,
  type DepthBook,
  type EqBlotterView,
  type EquityQuote,
  type EqWatchlistSort,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisNarratorPreference,
  type JarvisSkin,
  type LayoutEngine,
  type LoginWaitDelay,
  type LoginWaitStyle,
  type MarketDataPort,
  nextEqWatchlistSort,
  nextPowerSaverLevel,
  nextThemeModePreference,
  type PanelSpecV1,
  type PlaceOrderRequest,
  type PowerSaverLevel,
  type RfqQuoteResult,
  resolveThemeMode,
  type ThemeSkin,
  type ViewMode,
} from "@rtc/domain";
import { useMachine, type ViewModel } from "@rtc/react-bindings";

/** Mirror of RfqsPresenter's presenter-local redirect delay. The contract spec
 * drives this with fake timers (advanceTimersByTimeAsync(1500)), so the fake
 * schedules onRedirect via a REAL setTimeout — preserving the exact timing the
 * spec asserts, instead of redirecting instantly. */
const REDIRECT_DELAY_MS = 1500;

/** Subscribe a React component to a BehaviorSubject; re-render on each emission. */
function useSubject<T>(subject: BehaviorSubject<T>): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);

      return () => {
        return sub.unsubscribe();
      };
    },
    () => {
      return subject.getValue();
    },
  );
}

interface Unsubscribable {
  unsubscribe(): void;
}

/** A warmed `@rx-state/core` `StateObservable` — structurally typed here (not
 * imported by name) so this test-only package doesn't need its own dependency
 * on `@rx-state/core` (a transitive dep via `@rtc/client-core-rxjs`). */
interface PeekableState<T> {
  subscribe(onNext: (v: T) => void): Unsubscribable;
  getValue(): T | Promise<T>;
}

/** Subscribe a React component to a shared machine's `state$` (mirrors
 * useSubject, for the eqWorkspace singleton which — unlike the per-mount
 * `useMachine`-bridged machines — is constructed once for the whole World). */
function useMachineState<T>(state$: PeekableState<T>): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = state$.subscribe(onChange);

      return () => {
        return sub.unsubscribe();
      };
    },
    () => {
      const v = state$.getValue();

      if (v instanceof Promise) {
        throw new Error("eqWorkspace state$ not initialized");
      }

      return v;
    },
  );
}

/** The REAL createJarvisMachine, one shared instance PER WORLD — keyed by
 * World identity (not built inside createWorld itself, since the machine is
 * an application-layer concern; see world.ts's `JarvisWorld` doc comment).
 * Every `reactViewModel(world)` call (one per `mountWith`/`mount`) reuses the
 * same cached machine, mirroring world.eqWorkspace's per-World singleton so a
 * co-mounted JarvisOrb + JarvisOverlay observe the same open/phase/entries.
 * Typed as the widened `JarvisMachineHandle` (not the plain `Machine`) so
 * `getJarvisPanelsBridge` below can read its `events$` — Task 6's sole event
 * source for the generative-UI panels machine, mirroring composition.ts's own
 * `jarvis.events$` wiring. */
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

/** Every `PanelId` reachable in one layout tree, walked from its root — a
 * `"panel"` leaf contributes its own id, a `"split"` node contributes its
 * children's. Mirrors `composition.ts`'s own `collectPanelIds` (private
 * there) — this test-only fixture keeps its own copy rather than reaching
 * into `@rtc/client-core-rxjs`'s composition-root internals, exactly like
 * `JarvisPanelLayer.contract.spec.ts` keeps its own copy of
 * `ScriptedJarvisEngine`'s module-private `SCRIPTED_PANEL_ID`. */
function collectPanelIds(node: LayoutNode): readonly string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

/** `JarvisDriverMachine`'s `knownLayoutPanelIds` dep source (Task 12/P5) —
 * the static panel ids in `tab`'s DEFAULT layout tree, mirroring
 * `composition.ts`'s `LAYOUT_PANEL_IDS`. Computed fresh per call (no
 * module-load cache, unlike composition.ts's optimization) since a test
 * fixture's call volume never warrants it. */
function knownLayoutPanelIds(tab: WorkspaceTab): readonly string[] {
  return collectPanelIds(createDefaultLayoutPort(tab).initial.root);
}

/** The REAL `createWorkspaceNavMachine`, one shared instance PER WORLD —
 * same per-World-singleton doctrine as `jarvisMachines` above (Task 12/P5).
 * `App.tsx`'s own promoted composition-root singleton (`Presenters.
 * workspaceNav`) is the production mirror of this cache: a driven
 * `"switchTab"` command targets the SAME instance a mounted `AppShell`'s
 * `useWorkspaceNav()` reads from. */
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

/** The REAL per-tab `createLayoutMachine` SINGLETON map, one map PER WORLD —
 * mirrors `composition.ts`'s `layoutFor` (Task 12/P5): a driven `"layout"`
 * command (via `JarvisDriverMachine`'s `layout` dep, wired below) targets the
 * EXACT instance a mounted `AppShell`'s `useLayout(tab)` reads from, instead
 * of a throwaway per-mount machine nothing else observes (the Task 6 review
 * defect `composition.ts`'s own `layoutFor` doc describes). Built lazily,
 * one entry per tab, on first request — cheap either way (4-entry cap). */
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
    // this consults `dock.seedFor(tab)` afresh per tab — including after a
    // reset has nulled the dock's own snapshot.
    machine = createLayoutMachine(createDefaultLayoutPort(tab), {
      seedState: dock.seedFor(tab),
    });
    byTab.set(tab, machine);

    // Records synchronously (the replay-current `state$`), before this
    // function returns — `createWorkspaceDock`'s `layoutFor` contract.
    machine.state$.subscribe((layoutState) => {
      dock.recordLayoutState(tab, layoutState);
    });
    // `skip(1)` drops the replay of the state this machine was created with —
    // merely OPENING a tab is not a change worth persisting (composition's
    // own reasoning, reproduced).
    machine.state$.pipe(skip(1)).subscribe(() => {
      getPersistKick$(world).next();
    });
  }

  return machine;
}

/** Every World's REAL `createJarvisPanelsMachine` handle, registered by
 * `getJarvisPanelsBridge` the instant it exists — BEFORE that constructor
 * reaches `getWorkspaceDock(world)` below, whose OWN construction can, exactly
 * once at boot, need this same machine to restore a persisted docked panel
 * (`createWorkspaceDock`'s `restorePersistedDocks`). Registering here, not
 * only in the full `jarvisPanelsBridges` cache (set at the very END of that
 * constructor), is what breaks the cycle: without it, a World whose FIRST
 * touch is a layout tab (never Jarvis) would have `getWorkspaceDock`
 * force-build the bridge from `panelsMachineFor` below, which would recurse
 * back into the SAME `getJarvisPanelsBridge` call already on the stack. */
const panelsMachines = new WeakMap<World, JarvisPanelsMachineHandle>();

const EMPTY_JARVIS_PANELS_STATE: JarvisPanelsState = { panels: [] };

/** `WorkspaceDockPanels.current`'s NON-forcing read: a kick from a layout
 * machine alone (no Jarvis touched yet) must not build the panels machine as
 * a side effect — the invariant `createWorkspaceDock`'s `dockedPlacements`
 * (the writer's read) and `resetWorkspaceLayout` (its `deps.panels.current()`
 * loop) both rely on. Reads straight off `panelsMachines`, not the full
 * bridge — available the instant `getJarvisPanelsBridge` registers its
 * machine, even mid-construction. */
function panelsSnapshot(world: World): readonly PanelInstance[] {
  const machine = panelsMachines.get(world);
  return machine
    ? readStateNow(machine.state$, EMPTY_JARVIS_PANELS_STATE).panels
    : [];
}

/** `WorkspaceDockPanels.dock`/`undock`/`dismiss`/`restore`'s resolver — these
 * only ever run while a panel is actually being docked/undocked/dismissed/
 * restored, which itself requires the panels roster to exist, so forcing
 * `getJarvisPanelsBridge` into existence here (when this World's first touch
 * was a layout tab, never Jarvis) is correct rather than surprising. */
function panelsMachineFor(world: World): JarvisPanelsMachineHandle {
  return panelsMachines.get(world) ?? getJarvisPanelsBridge(world).machine;
}

const dockLayoutStores = new WeakMap<World, DockLayoutStore>();

/** The per-World dock-layout-store singleton — mirrors `composition.ts`'s own
 * `dockLayoutStore` const: Reset must clear the SAME store `layoutPresets`
 * and `Presenters.dockLayoutStore` read, so both are built from this one
 * getter rather than each minting an independent `InMemoryDockLayoutStore`. */
function getDockLayoutStore(world: World): DockLayoutStore {
  let store = dockLayoutStores.get(world);

  if (!store) {
    store = new InMemoryDockLayoutStore();
    dockLayoutStores.set(world, store);
  }

  return store;
}

const dockedPanelTabsKicks = new WeakMap<World, Subject<void>>();

/** Bumped after EVERY change to which tab a docked panel belongs to (the
 * dock's `onDockedMembershipChange`) — mirrors `composition.ts`'s own
 * `dockedPanelTabsKick$`: `jarvisPanelsMachine` flips a panel's `docked` flag
 * SYNCHRONOUSLY inside the dock bridge, before that same call goes on to
 * attribute the panel to a tab, so a bare `panelsMachine.state$` subscriber
 * would compute membership against an attribution that hasn't been written
 * yet on the very emission that matters — this is what makes the attributed
 * membership visible. Deliberately a SEPARATE Subject from `persistKick$`
 * below: a reset with nothing ever docked and no tab ever opened still calls
 * `onDockedMembershipChange()` once, and that must not, on its own, wake the
 * persistence writer (composition.ts never wires `dockedPanelTabsKick$` to
 * the writer either). */
function getDockedPanelTabsKick$(world: World): Subject<void> {
  let kick = dockedPanelTabsKicks.get(world);

  if (!kick) {
    kick = new Subject<void>();
    dockedPanelTabsKicks.set(world, kick);
  }

  return kick;
}

const persistKicks = new WeakMap<World, Subject<void>>();

/** One kick per change worth persisting — mirrors `composition.ts`'s own
 * `persistKick$`: fed by each layout machine's `skip(1)` subscription
 * (`getLayoutFor`) and the panels-roster `skip(1)` subscription
 * (`getJarvisPanelsBridge`), and consumed only by the debounced writer below.
 * Kept separate from `getDockedPanelTabsKick$` above for the same reason
 * composition.ts keeps `persistKick$` and `dockedPanelTabsKick$` apart. */
function getPersistKick$(world: World): Subject<void> {
  let kick = persistKicks.get(world);

  if (!kick) {
    kick = new Subject<void>();
    persistKicks.set(world, kick);
  }

  return kick;
}

const workspaceDocks = new WeakMap<World, WorkspaceDock>();

/** The REAL `createWorkspaceDock(deps)`, one instance PER WORLD — mirrors
 * `composition.ts`'s own singleton: every dock/undock/dismiss/reset/restore
 * rule this fixture used to hand-mirror now lives in ONE place shared by
 * every application core, so a change to those rules is no longer invisible
 * to the UI contract tier. `panels` is wired through `panelsMachineFor`/
 * `panelsSnapshot` above rather than a closed-over machine reference, so this
 * dock can be built — and, once, even RESTORE a persisted docked panel —
 * before any Jarvis panel has ever been touched. */
function getWorkspaceDock(world: World): WorkspaceDock {
  const cached = workspaceDocks.get(world);

  if (cached) {
    return cached;
  }

  const panels: WorkspaceDockPanels = {
    current: () => {
      return panelsSnapshot(world);
    },
    dock: (panelId: string) => {
      panelsMachineFor(world).dockPanel(panelId);
    },
    undock: (panelId: string) => {
      panelsMachineFor(world).undockPanel(panelId);
    },
    dismiss: (panelId: string) => {
      panelsMachineFor(world).dismissPanel(panelId);
    },
    restore: (panelId: string, spec: PanelSpecV1) => {
      panelsMachineFor(world).restoreDockedPanel(panelId, spec);
    },
  };

  const dock = createWorkspaceDock({
    panels,
    layoutFor: (tab: WorkspaceTab) => {
      return getLayoutFor(world, tab);
    },
    activeTab: () => {
      return readStateNow(getWorkspaceNav(world).state$, FALLBACK_NAV_STATE)
        .activeTab;
    },
    readStoredLayout: () => {
      return world.workspaceLayout.getValue();
    },
    clearStoredLayout: () => {
      world.workspaceLayout.next(null);
    },
    dockLayoutStore: getDockLayoutStore(world),
    onDockedMembershipChange: () => {
      getDockedPanelTabsKick$(world).next();
    },
    onResetsBump: () => {
      world.workspaceLayoutResets.next(
        world.workspaceLayoutResets.getValue() + 1,
      );
    },
  });

  workspaceDocks.set(world, dock);

  // Boot-time rehydration of the stored docked panels — mirrors
  // `composition.ts`'s own `workspaceDock.restorePersistedDocks()` call,
  // right after construction and before the writer (below) ever subscribes,
  // so restoring is not itself read as a change worth persisting. `panels
  // .restore` above forces this World's Jarvis panels bridge into existence
  // if this dock's FIRST touch was a layout tab that was never otherwise
  // going to build one — correct here, since restoring a persisted docked
  // panel genuinely needs the roster to exist.
  dock.restorePersistedDocks();

  // The REAL debounced writer, over `World.workspaceLayout` as its store —
  // so a dock/undock/layout change genuinely re-serializes through
  // `serializeWorkspaceLayout` (orphan/ghost reconciliation included) and a
  // rehydration spec can hand the result to a SECOND `createWorld`.
  // `debounceMs: 0` because the contract tier asserts WHAT gets persisted,
  // never the settle window — coalescing has its own unit test
  // (`workspacePersistenceWriter.test.ts`, virtual time). Zero still
  // schedules on a macrotask, so a spec awaits one tick before reading.
  createWorkspacePersistenceWriter({
    kick$: getPersistKick$(world),
    readStoredLayout: () => {
      return world.workspaceLayout.getValue();
    },
    writeStoredLayout: (value: string) => {
      world.workspaceLayout.next(value);
    },
    createdLayouts: dock.createdLayouts,
    dockedPanels: dock.dockedPlacements,
    debounceMs: 0,
  });

  return dock;
}

/** Current value of a warm machine `state$`, read synchronously by
 * subscribing and immediately unsubscribing — this repo's convention for an
 * un-defaulted `StateObservable` whose `getValue()` types as
 * `T | StatePromise<T>` (see `composition.ts`'s `wireJarvisHistorySource`). */
function readStateNow<T>(state$: Observable<T>, fallback: T): T {
  let value = fallback;
  state$
    .subscribe((next) => {
      value = next;
    })
    .unsubscribe();
  return value;
}

/** Subscribe a React component to a plain (non-BehaviorSubject) Observable
 * that is warm/replay-current in practice — mirrors `useSubject` above, but
 * reads its synchronous current value via `readStateNow`'s subscribe-then-
 * unsubscribe peek rather than `.getValue()`, since `Stream<T>` (the
 * `LayoutPresetsPresenter.presetsFor` shape, Phase 6b Task 6) exposes no
 * such accessor. No extra snapshot caching needed (unlike
 * `useDockedPanelIdsFor` below): the controller only calls `.next()` on a
 * genuine write, so repeated peeks between renders return the SAME array
 * reference. */
function useObservableNow<T>(source$: Observable<T>, fallback: T): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = source$.subscribe(onChange);

      return () => {
        return sub.unsubscribe();
      };
    },
    () => {
      return readStateNow(source$, fallback);
    },
  );
}

/** Element-wise equality for `workspaceDock.dockedPanelIdsNow`'s cached-
 * snapshot check below — order-sensitive (matches `bridge.panels$`'s own
 * iteration order), which is fine: the underlying `panels$` array only
 * changes order on an actual panel add/remove/reorder, never a no-op
 * emission. */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((id, index) => {
    return id === b[index];
  });
}

/** Subscribes a React component to `workspaceDock.dockedPanelIdsNow(tab)` —
 * recomputed on every `panels$` emission (the `docked` flag itself) AND every
 * `dockedPanelTabsKick$` tick (the tab-attribution write, which lands
 * out-of-band from `panels$` — see composition.ts's own `dockedPanelTabsKick$`
 * doc for why the two can't be collapsed into one signal).
 *
 * TRAP: `useSyncExternalStore`'s `getSnapshot` MUST be referentially stable
 * when nothing has actually changed — React compares snapshots with
 * `Object.is`, and `dockedPanelIdsNow` returns a fresh `.filter().map()` array
 * on every single call. Returning that array directly here made every render
 * see a "changed" snapshot, which resubscribes/rerenders in an infinite
 * microtask loop the instant any AppShell mounts this hook (see the React
 * docs' "you should always return a cached snapshot" rule for
 * `useSyncExternalStore`). The `useRef` below caches the previous array and
 * hands it back unchanged whenever the new one is element-wise equal. */
function useDockedPanelIdsFor(
  world: World,
  tab: WorkspaceTab,
): readonly string[] {
  const bridge = getJarvisPanelsBridge(world);
  const dock = getWorkspaceDock(world);
  const cache = useRef<readonly string[]>([]);

  return useSyncExternalStore(
    (onChange) => {
      const sub = merge(
        bridge.panels$,
        getDockedPanelTabsKick$(world),
      ).subscribe(onChange);

      return () => {
        return sub.unsubscribe();
      };
    },
    () => {
      // Sorted: `panelsState.panels`' own order reflects spawn/dock
      // sequencing, which is incidental to this stream's membership
      // contract — sorting stabilizes the emitted array's identity for
      // downstream element-wise-equals consumers (both clients' bridge
      // props), mirroring `composition.ts`'s own `dockedPanelIdsFor`
      // (`workspaceDock.dockedIdsIn(tab, panelsState.panels).sort()`).
      // `getLayoutPresets`'s own `dockedPanelIdsNow` dep stays UNSORTED —
      // composition passes `workspaceDock.dockedPanelIdsNow` there
      // unchanged. The sort happens HERE, before the cached-snapshot
      // identity compare below — sorting after that compare would defeat
      // it (two dock orders producing the same sorted array must read as
      // unchanged).
      const next = [...dock.dockedPanelIdsNow(tab)].sort();

      if (!sameIds(next, cache.current)) {
        cache.current = next;
      }

      return cache.current;
    },
  );
}

/** The raw store BEHIND `getLayoutPresets`'s controller for `world` — the
 * per-framework half of `@ui-contract/harness/layoutPresetStore` (registered
 * in `setup.ts`), so a neutral spec can delete a record the way ANOTHER
 * browser tab would: behind the controller's back, leaving the published list
 * still showing the row. Throws rather than minting a store: a World whose
 * ViewModel has not been built yet has no controller and therefore no store,
 * and answering with an empty stand-in would let a spec assert against a store
 * the UI never reads. */
export function layoutPresetStoreFor(world: World): LayoutPresetStore {
  const store = layoutPresetStores.get(world);

  if (!store) {
    throw new Error(
      "No layout-preset store for this World — build its ViewModel (mount a " +
        "component) before reaching the store behind it.",
    );
  }

  return store;
}

const layoutPresetStores = new WeakMap<World, LayoutPresetStore>();

const layoutPresetsControllers = new WeakMap<World, LayoutPresetsPresenter>();

/** The REAL `createLayoutPresets` controller (Phase 6b Task 6), one instance
 * PER WORLD — same per-World-singleton doctrine as `getLayoutFor`/
 * `getWorkspaceNav` above, mirroring `composition.ts`'s own
 * `Presenters.layoutPresets` singleton. Every rule (save/load/delete/name/
 * cap/unreadable) lives ONCE in the controller; this fixture supplies only
 * its dependencies — `layoutFor` reuses `getLayoutFor`, `layoutStateNow`/
 * `dockedPanelIdsNow` reuse the SAME `WorkspaceDock` `useDockedPanelIdsFor`
 * reads, `dockLayoutStore` is the SAME per-World singleton
 * `Presenters.dockLayoutStore` exposes (`getDockLayoutStore`), and
 * `rebuildLiveEngine` bumps the SAME `workspaceLayoutResets` subject
 * `workspaceDock.resetWorkspaceLayout` does. Seeded from
 * `World.layoutPresetsSeed` — a later contract spec's deliberately unreadable
 * record needs a raw string, not a typed shape (see that field's own doc). */
function getLayoutPresets(world: World): LayoutPresetsPresenter {
  const cached = layoutPresetsControllers.get(world);

  if (cached) {
    return cached;
  }

  const store = new InMemoryLayoutPresetStore();
  layoutPresetStores.set(world, store);

  for (const [tab, raw] of Object.entries(world.layoutPresetsSeed)) {
    store.save(tab, raw);
  }

  const dock = getWorkspaceDock(world);
  const controller = createLayoutPresets({
    store,
    dockLayoutStore: getDockLayoutStore(world),
    layoutFor: (tab: WorkspaceTab) => {
      return getLayoutFor(world, tab);
    },
    layoutStateNow: (tab: WorkspaceTab) => {
      return dock.layoutStateNow(tab);
    },
    dockedPanelIdsNow: (tab: WorkspaceTab) => {
      return dock.dockedPanelIdsNow(tab);
    },
    rebuildLiveEngine: () => {
      world.workspaceLayoutResets.next(
        world.workspaceLayoutResets.getValue() + 1,
      );
    },
  });
  layoutPresetsControllers.set(world, controller);
  return controller;
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
 * .spec.ts's "ChartPanel pages only the primary…" case spies on it). Only
 * `candles()`/`candleHistory()` are ever actually called by the presenter;
 * `quotes()`/`depth()` are wired for interface completeness via `as
 * unknown` casts (the World's per-symbol subjects are nullable ahead of
 * first data, a shape the presenter never touches). */
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
 * plain `BehaviorSubject`s kept warm for the World's lifetime — see
 * `getCandleBridge` for why a churn-free subscription matters here. */
interface CandleBridge {
  readonly candles$: BehaviorSubject<readonly Candle[]>;
  readonly backfill$: BehaviorSubject<CandleBridgeBackfill>;
}

const candleBridges = new WeakMap<World, Map<string, CandleBridge>>();

/** One subscription-per-(World, symbol|timeframe) to `CandleSeriesPresenter
 * .candles$`/backfill streams, mirrored into permanently-warm
 * `BehaviorSubject`s `useSubject` can read synchronously. Deliberately NOT
 * `useSyncExternalStore`-subscribed directly to the presenter's streams:
 * `candles$` wraps a `shareReplay({ refCount: true })` inside a `defer()`
 * that resets the backfill state (older$/exhausted$/latestFirst) on every
 * FRESH subscription — a `useSyncExternalStore` subscribe callback that
 * churns every render (a new closure each call) would tear down and
 * re-establish that subscription every commit, silently un-latching
 * `historyExhausted` between renders. A single subscribe here, kept alive
 * for the World's lifetime, avoids that churn entirely. */
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
 * (Task 12/P5) — mirrors `jarvisMachines`/`jarvisPanelsBridges`'s per-World
 * cache. Built from the SAME `getJarvisMachine(world).events$` the panels
 * bridge above reads (both guarded with the identical `catchError(() =>
 * EMPTY)`, mirroring `composition.ts`'s doc for why both folds need the
 * source guarded independently), targeting `getWorkspaceNav`/`getLayoutFor`
 * above and `world.eqWorkspace` — the SAME singletons a mounted `AppShell`
 * reads from, so a driven command is observable through the real UI exactly
 * like production. Also wires `outcomes$` into
 * `getJarvisMachine(world).intents.recordDriveOutcome` (composition.ts's own
 * late-bound subscription, reproduced here) so applied commands fold into
 * the transcript as `"drive: <kind>"` rows. */
const jarvisDrivers = new WeakMap<World, JarvisDriverMachineHandle>();

function getJarvisDriverMachine(world: World): JarvisDriverMachineHandle {
  let driver = jarvisDrivers.get(world);

  if (!driver) {
    const machine = getJarvisMachine(world);
    // dockPanel/undockPanel/dismissPanel are the REAL `WorkspaceDock`'s
    // layout-tree-integrated bridges, NOT the raw panels machine's intents —
    // exactly what `composition.ts` hands this machine, and what makes a
    // driven `dockPanel` command observable as a workspace leaf rather than
    // only as a `docked: true` flag. livePanelIds$/dockedPanelIds$ are
    // derived from the bridge's existing panels$ VM stream rather than a
    // second read of the raw machine.
    const panelsBridge = getJarvisPanelsBridge(world);
    const dock = getWorkspaceDock(world);
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
      dismissPanel: dock.dismissPanel,
      dockPanel: dock.dockPanel,
      undockPanel: dock.undockPanel,
      knownLayoutPanelIds,
      detachedPanelIds: dock.detachedPanelIds,
      knownSymbols$: world.watchlist.pipe(
        map((list) => {
          return list.map((instrument) => {
            return instrument.symbol;
          });
        }),
      ),
      powerSaverLevel$: world.powerSaverLevel,
      livePanelIds$: panelsBridge.panels$.pipe(
        map((rows) => {
          return rows.map((row) => {
            return row.panelId;
          });
        }),
      ),
      dockedPanelIds$: panelsBridge.panels$.pipe(
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
 * mirrors `jarvisDrivers`'s per-World cache above. Reads `getJarvisMachine
 * (world).state$`/`.events$` (the SAME `catchError(() => EMPTY)` guard
 * `getJarvisDriverMachine` applies to `events$` — its own `events$` input is
 * equally terminal on error) and `jarvis.intents` narrowed to the four
 * members the demo actually drives, exactly like `composition.ts`'s own
 * `jarvisDemo` wiring. */
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

/**
 * Bridges the REAL `JarvisPanelsPresenter` (Task 9) into plain
 * BehaviorSubjects this driver's existing `useSubject` helper can read.
 * `presenter.panels$`/`presenter.panelData$(panelId)` are ordinary (non-
 * Behavior) Observables, and this test-only fixtures package deliberately
 * has no direct `@rx-state/core` dependency (unlike client-solid's sibling
 * fixture — see that package's own viewModelFromWorld.ts), so a manual
 * warm-subscribe-into-a-BehaviorSubject bridge is the shape that fits here.
 * One bridge per World, cached like `jarvisMachines` above. The subscribe
 * below is safe to treat as synchronously-seeded: `createJarvisPanelsMachine`
 * keeps its own `state$` warm internally (see that file's doc), so
 * `presenter.panels$` always has a current value to replay the moment this
 * bridge subscribes — mirroring `useSubject`'s own BehaviorSubject
 * assumption. The presenter's OWN internal caches (composePanelStream's
 * per-panelId warm subscriptions) are what actually keep a live panel's port
 * streams flowing independent of whether any component is currently mounted
 * to read them; this bridge only rehosts that same data as something React's
 * `useSyncExternalStore`-backed `useSubject` can read synchronously. */
interface JarvisPanelsBridge {
  readonly panels$: BehaviorSubject<readonly JarvisPanelVm[]>;
  /** The presenter's OWN dismiss — roster-only, leaf-blind (identical to
   * `machine.dismissPanel`; `JarvisPanelsPresenter` re-exposes the machine's
   * own method verbatim). Every caller outside this fixture's own bridges
   * wants `WorkspaceDock.dismissPanel` instead (the docked-safe one
   * composition exposes as `Presenters.dismissPanel`). */
  readonly dismissPanel: (panelId: string) => void;
  /** The raw panels MACHINE handle — `dockPanel`/`undockPanel` live here
   * because the presenter deliberately does not re-export them (docking is
   * only half a panels-machine operation; see its class doc), exactly as
   * `composition.ts` keeps the handle for the same reason. */
  readonly machine: JarvisPanelsMachineHandle;
  panelData$(panelId: string): BehaviorSubject<PanelData | null>;
}

const jarvisPanelsBridges = new WeakMap<World, JarvisPanelsBridge>();

function getJarvisPanelsBridge(world: World): JarvisPanelsBridge {
  const cached = jarvisPanelsBridges.get(world);

  if (cached) {
    return cached;
  }

  const machine = getJarvisMachine(world);
  // `createJarvisPanelsMachine`'s `events$` input is TERMINAL on error (kills
  // its fold) — same catchError/EMPTY guard composition.ts applies to the
  // real `jarvis.events$` before handing it to the same factory.
  const panelsMachine = createJarvisPanelsMachine(
    machine.events$.pipe(
      catchError(() => {
        return EMPTY;
      }),
    ),
  );

  // Registered BEFORE `getWorkspaceDock` below — see `panelsMachines`'s own
  // doc for why: that call's construction can, exactly once at boot, reach
  // synchronously back INTO this very machine to restore a persisted docked
  // panel.
  panelsMachines.set(world, panelsMachine);

  const presenter = new JarvisPanelsPresenter(
    panelsMachine,
    world.panelStreamDeps,
  );

  // Forces this World's dock into existence (boot-restoring any persisted
  // docked panel into the roster we just registered above) if nothing has
  // built it yet — mirrors `composition.ts`'s own construction order, where
  // `jarvisPanelsMachine` always exists before `workspaceDock
  // .restorePersistedDocks()` runs.
  getWorkspaceDock(world);

  // Session-lifetime mirror of the raw fold (composition's own
  // `jarvisPanelsMachine.state$` writer subscription), feeding the persist
  // kick. `map` + `distinctUntilChanged` on the panels ARRAY, not the state
  // object: every intent produces a fresh state object even when its
  // reducer was a no-op, so subscribing to `state$` directly would persist
  // on a REJECTED dock of an unknown id. Established AFTER the dock is
  // forced above (not before), so THAT call's own boot restoration is not
  // itself read as a change worth persisting — composition.ts's identical
  // ordering (`restorePersistedDocks()` runs before this subscription
  // exists).
  panelsMachine.state$
    .pipe(
      map((panelsState) => {
        return panelsState.panels;
      }),
      distinctUntilChanged(),
      skip(1),
    )
    .subscribe(() => {
      getPersistKick$(world).next();
    });

  const panels$ = new BehaviorSubject<readonly JarvisPanelVm[]>([]);
  presenter.panels$.subscribe(panels$);

  const dataSubjects = new Map<string, BehaviorSubject<PanelData | null>>();

  function panelData$(panelId: string): BehaviorSubject<PanelData | null> {
    const cachedSubject = dataSubjects.get(panelId);

    if (cachedSubject) {
      return cachedSubject;
    }

    const subject = new BehaviorSubject<PanelData | null>(null);
    presenter.panelData$(panelId).subscribe(subject);
    dataSubjects.set(panelId, subject);
    return subject;
  }

  const bridge: JarvisPanelsBridge = {
    panels$,
    dismissPanel: presenter.dismissPanel,
    machine: panelsMachine,
    panelData$,
  };
  jarvisPanelsBridges.set(world, bridge);
  return bridge;
}

/** Build a reactive ViewModel backed by the neutral World. */
export function reactViewModel(world: World): ViewModel {
  const s = world.sources;
  // Dock-layout store: world-scoped (not module-level), so each World built
  // by a spec gets its own fresh store — mirrors the real
  // Presenters.dockLayoutStore's per-app-instance lifetime. The SAME instance
  // `createWorkspaceDock`'s Reset clears (`getDockLayoutStore`'s doc).
  const dockStore = getDockLayoutStore(world);
  return {
    // Parametric query hooks: each call subscribes to the World's per-key
    // subject, so a tile reading usePrice("EURUSD") re-renders only when that
    // symbol is pushed — faithfully mirroring @react-rxjs `bind`'s per-argument
    // streams (presenters.priceStream.price$(pair), priceHistory.history$(sym)).
    usePrice: (pair: CurrencyPair) => {
      return useSubject(world.priceFor(pair.symbol));
    },
    usePriceHistory: (symbol: string) => {
      return useSubject(world.historyFor(symbol));
    },
    useEquityPriceHistory: () => {
      return [];
    },
    useQuotesForRfq: (rfqId: number) => {
      return useSubject(world.quotesForRfq(rfqId));
    },
    // Nullary query hooks: reactive, re-render on push.
    useTrades: () => {
      return useSubject(s.useTrades);
    },
    // New-trade flagging lives in the presenter (not pinned by contract specs);
    // the fake reports no rows as new.
    useNewTradeIds: () => {
      return new Set<number>();
    },
    // The Activity feed's live/seed split and receipt-time stamping live in
    // the presenter (BlotterPresenter.activity$, not pinned by contract
    // specs) — specs inject the already-derived entries directly, the same
    // way they inject useTrades.
    useActivity: () => {
      return useSubject(s.useActivity);
    },
    useAnalytics: () => {
      return useSubject(s.useAnalytics);
    },
    useRfqs: () => {
      return useSubject(s.useRfqs);
    },
    useAllQuotes: () => {
      return useSubject(s.useAllQuotes);
    },
    useCurrencyPairs: () => {
      return useSubject(s.useCurrencyPairs);
    },
    useInstruments: () => {
      return useSubject(s.useInstruments);
    },
    useDealers: () => {
      return useSubject(s.useDealers);
    },
    useConnectionStatus: () => {
      return useSubject(s.useConnectionStatus);
    },
    // Command: record input and resolve undefined so the consuming component's
    // `await` proceeds to its post-await state transition.
    useAcceptQuote: () => {
      return async (quoteId: number) => {
        world.commands.acceptQuote.push(quoteId);
      };
    },
    // Command: record the cancelled rfq id, mirroring useAcceptQuote's shape
    // (one-shot fire-and-await; the bridge does firstValueFrom).
    useCancelRfq: () => {
      return async (rfqId: number) => {
        world.commands.cancelRfq.push(rfqId);
      };
    },
    // Command: record the reconnect invocation so contract specs can assert
    // "clicking Reconnect fires the command exactly once".
    useReconnect: () => {
      return () => {
        world.commands.reconnect += 1;
      };
    },
    useReportDetachedPanels: () => {
      return getWorkspaceDock(world).reportDetachedPanels;
    },
    // Machine: the REAL createTileExecutionMachine, driven by a World-backed
    // execute command that records inputs and emits the canned result (or errors
    // to drive the timeout-confirmation path), faithfully exercising the
    // relocated lifecycle through the same useMachine bridge the app uses.
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
    // request-quote command that records inputs and emits the canned result (or
    // errors to drive the rejected path), exercising the relocated RFQ lifecycle
    // through the same useMachine bridge the app uses.
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
    // Intent-free derived flags: the REAL createStaleFlagMachine, sourced from
    // the World's connection-status subject and the per-key price / analytics
    // subjects — so disconnect/reconnect/new-value pushed onto the World drives
    // the relocated stale logic through the same useMachine bridge the app uses.
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
    // Intent-free derived flag: the REAL createRowHighlightMachine. The contract
    // spec drives the 3s fade with fake timers, so the real RxJS timer(HIGHLIGHT_MS)
    // is driven by the spec's advanceTimersByTime through the same useMachine bridge
    // the app uses — preserving the exact fade timing.
    useRowHighlight: (isNew: boolean) => {
      return useMachine(() => {
        return createRowHighlightMachine(isNew);
      }).state;
    },
    // Machine: the REAL createNotionalMachine, exercising the relocated notional
    // logic through the same useMachine bridge the app uses.
    useNotional: (defaultNotional: number) => {
      return useMachine(() => {
        return createNotionalMachine(defaultNotional);
      });
    },
    // Submission machine fake: stateful per-mount store that records the RFQ to
    // world.commands.createRfq, flips editing→submitting→confirmed, and schedules
    // onRedirect via a REAL setTimeout(REDIRECT_DELAY_MS) so the spec's fake-timer
    // advance drives the redirect with the same timing as the real RxJS timer.
    // Mirrors RfqsPresenter.createSubmission: the same timeout that fires
    // onRedirect also returns the state to editing — the docked panel is never
    // unmounted, so the fake must hand back an empty editing state exactly
    // like the real machine, or specs would never exercise the reset path.
    useRfqSubmission: () => {
      const [submissionState, setSubmissionState] =
        useState<RfqSubmissionState>({
          status: "editing",
        });

      const submit = useCallback(
        (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
          world.commands.createRfq.push(input);
          setSubmissionState({ status: "submitting" });
          // Mirror the real machine, where submitting is emitted synchronously
          // and confirmed only arrives after the async create-RFQ RPC resolves.
          // With no seeded result the submission stays in flight, so a spec can
          // observe the transient "Submitting…" render; when a result IS seeded
          // the fake confirms in the same tick (editing→confirmed) as before.
          const rfqId = world.results.createRfq;

          if (rfqId === undefined) {
            return;
          }

          setSubmissionState({ status: "confirmed", rfqId });
          setTimeout(() => {
            onRedirect(rfqId);
            setSubmissionState({ status: "editing" });
          }, REDIRECT_DELAY_MS);
        },
        [],
      );
      return { state: submissionState, submit };
    },
    // Ticket submission machine fake: stateful per-mount store that records the
    // quote/pass command to world.commands.* and flips submitted:true, mirroring
    // the relocated submit-price / pass flow.
    useTicketSubmission: () => {
      const [ticketState, setTicketState] = useState<TicketSubmissionState>({
        submitted: false,
      });

      const submitPrice = useCallback((quoteId: number, price: number) => {
        world.commands.quoteRfq.push({ quoteId, price });
        setTicketState({ submitted: true });
      }, []);

      const pass = useCallback((quoteId: number) => {
        world.commands.passQuote.push(quoteId);
        setTicketState({ submitted: true });
      }, []);
      return { state: ticketState, submitPrice, pass };
    },
    // Global throughput: reactive view backed by the World subject; setValue
    // records the value and optimistically echoes it into the view (mirroring
    // the presenter's immediate echo), so the panel reflects the edit at once.
    useThroughput: () => {
      const view = useSubject(world.throughput);
      return {
        ...view,
        setValue: (value: number) => {
          world.throughputSets.push(value);
          world.setThroughputView({ value });
        },
      };
    },
    // Global theme mode: reactive view backed by the World subject. The subject
    // holds the stored PREFERENCE (dark | light | system); `mode` is resolved for
    // painting and `cycle` advances the preference through the seam (mirroring the
    // PreferencesPort's replay-current themeMode$ stream). The harness has no OS
    // media query, so "system" resolves deterministically to dark.
    useThemePreference: () => {
      const modePreference = useSubject(world.themeMode);
      return {
        mode: resolveThemeMode(modePreference, true),
        modePreference,
        cycle: () => {
          // Read the current value (not the captured one) so rapid clicks each
          // advance from the true state, mirroring the real presenter's cycle().
          return world.themeMode.next(
            nextThemeModePreference(world.themeMode.getValue()),
          );
        },
      };
    },
    // Global theme skin: reactive view backed by the World subject; setSkin pushes
    // back so a change through the seam repaints the skin (mirroring the
    // PreferencesPort's replay-current themeSkin$ stream).
    useThemeSkinPreference: () => {
      const skin = useSubject(world.themeSkin);
      return {
        skin,
        setSkin: (next: ThemeSkin) => {
          return world.themeSkin.next(next);
        },
      };
    },
    // Animated background: reactive boolean backed by the World subject; setEnabled
    // /toggle push back so a click through the seam flips the rendered flag, and
    // each written value is recorded so a spec can assert the seam was written
    // (e.g. PreferencesModal's animated-bg toggle → animatedBackgroundSets [true]).
    useAnimatedBackground: () => {
      const enabled = useSubject(world.animatedBackground);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.animatedBackgroundSets.push(on);
          world.animatedBackground.next(on);
        },
        toggle: () => {
          const next = !enabled;
          world.commands.animatedBackgroundSets.push(next);
          world.animatedBackground.next(next);
        },
      };
    },
    // Power-saver master override: reactive 3-state level (off/calm/freeze)
    // backed by the World subject; setLevel/cycle push back so a click through
    // the seam advances the rendered level, and each written level is
    // recorded, mirroring useAnimatedBackground.
    usePowerSaver: () => {
      const level = useSubject(world.powerSaverLevel);
      return {
        level,
        isCalm: level !== "off",
        isFreeze: level === "freeze",
        setLevel: (next: PowerSaverLevel) => {
          world.commands.powerSaverLevelSets.push(next);
          world.powerSaverLevel.next(next);
        },
        cycle: () => {
          const next = nextPowerSaverLevel(level);
          world.commands.powerSaverLevelSets.push(next);
          world.powerSaverLevel.next(next);
        },
      };
    },
    // Ambient style: reactive view backed by the World subject (mirrors
    // useThemeSkinPreference above); setStyle pushes back so a click through
    // the seam (PreferencesModal's "Ambient style" segment) flips the
    // rendered AmbientBackground branch.
    useAmbientStyle: () => {
      const style = useSubject(world.ambientStyle);
      return {
        style,
        setStyle: (next: AmbientStyle) => {
          world.ambientStyle.next(next);
        },
      };
    },
    // Chart substrate: reactive view backed by the World subject (mirrors
    // useAmbientStyle above); setSubstrate pushes back so a click through the
    // seam (PreferencesModal's "Chart renderer" segment) flips the value.
    useChartSubstrate: () => {
      const substrate = useSubject(world.chartSubstrate);
      return {
        substrate,
        setSubstrate: (next: ChartSubstrate) => {
          world.chartSubstrate.next(next);
        },
      };
    },
    // Layout engine: reactive view backed by the World subject (mirrors
    // useChartSubstrate above); setEngine pushes back so a click through the
    // seam (PreferencesModal's "Layout engine" segment) flips the value.
    useLayoutEngine: () => {
      const engine = useSubject(world.layoutEngine);
      return {
        engine,
        setEngine: (next: LayoutEngine) => {
          world.layoutEngine.next(next);
        },
      };
    },
    // Dock-layout store: plain passthrough (no rx) — the store itself is not
    // a stream, so no useSubject here, unlike every preference hook above.
    useDockLayoutStore: () => {
      return dockStore;
    },
    // Global force-boot-animation preference: reactive flag backed by the World
    // subject; setEnabled/toggle push back so a click through the seam flips
    // the rendered flag, and each written value is recorded, mirroring usePowerSaver.
    useForceBootAnimation: () => {
      const enabled = useSubject(world.forceBootAnimation);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.forceBootAnimationSets.push(on);
          world.forceBootAnimation.next(on);
        },
        toggle: () => {
          const next = !world.forceBootAnimation.value;
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
        style: useSubject(world.loginWaitStyle),
        setStyle: (style: LoginWaitStyle) => {
          world.commands.loginWaitStyleSets.push(style);
          world.loginWaitStyle.next(style);
        },
        delay: useSubject(world.loginWaitDelay),
        setDelay: (delay: LoginWaitDelay) => {
          world.commands.loginWaitDelaySets.push(delay);
          world.loginWaitDelay.next(delay);
        },
      };
    },
    // Global view-mode: reactive view backed by the World subject; setViewMode
    // pushes back so a toggle through the seam flips the rendered mode.
    useViewModePreference: () => {
      const viewMode = useSubject(world.viewMode);
      return {
        viewMode,
        setViewMode: (next: ViewMode) => {
          return world.viewMode.next(next);
        },
      };
    },
    // Credit RFQs filter: reactive view backed by the World subject; setFilter
    // pushes back so a click through the seam (RfqsHead's pills, Task 4)
    // re-renders RfqsPanel — mirroring useViewModePreference exactly.
    useCreditRfqFilterPreference: () => {
      const filter = useSubject(world.creditRfqFilter);
      return {
        filter,
        setFilter: (next: CreditRfqFilter) => {
          return world.creditRfqFilter.next(next);
        },
      };
    },
    // Equities watchlist sort: reactive view backed by the World subject;
    // setSort pushes back directly, cycle() reads the CURRENT value (not a
    // captured one) so rapid clicks each advance from the true state —
    // mirroring the real presenter's cycle().
    useEqWatchlistSort: () => {
      const sort = useSubject(world.eqWatchlistSort);
      return {
        sort,
        setSort: (next: EqWatchlistSort) => {
          return world.eqWatchlistSort.next(next);
        },
        cycle: () => {
          return world.eqWatchlistSort.next(
            nextEqWatchlistSort(world.eqWatchlistSort.getValue()),
          );
        },
      };
    },
    // Equities blotter tab: reactive view backed by the World subject;
    // setView pushes back so a tab click through the seam flips the rendered
    // view (Task 5 consumes this).
    useEqBlotterView: () => {
      const view = useSubject(world.eqBlotterView);
      return {
        view,
        setView: (next: EqBlotterView) => {
          return world.eqBlotterView.next(next);
        },
      };
    },
    // Auth: reactive state backed by the World subject; login/unlock/lock/logout
    // push back so the seam transition re-renders LoginScreen/LockScreen, mirroring
    // AuthPresenter's lifecycle just closely enough for component specs.
    useAuth: () => {
      const state = useSubject(world.auth);
      return {
        state,
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
      const visible = useSubject(world.bootGate);
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
    // relocated countdown logic through the same useMachine bridge the app uses.
    // Contract specs drive the countdown with fake timers.
    useRfqCountdown: (seed: RfqCountdownSeed) => {
      return useMachine(() => {
        return createRfqCountdownMachine(seed);
      }).state;
    },
    // Animation intents: backed by the World's per-target intent subject so the
    // AnimationIntents.contract.spec can push synthetic intents and assert the
    // data-anim mapping without wiring a real AnimationDirector.
    useAnimationIntents: (target: string) => {
      return useSubject(world.intentFor(target));
    },
    // Layout: the REAL per-tab createLayoutMachine SINGLETON (Task 12/P5,
    // getLayoutFor above) rather than a fresh per-mount instance — a driven
    // "layout" DriveCommand and a mounted AppShell's own useLayout(tab) now
    // read/write the SAME machine, mirroring composition.ts's layoutFor.
    useLayout: (tab: WorkspaceTab) => {
      const machine = getLayoutFor(world, tab);
      const state = useMachineState(machine.state$);
      return { state, ...machine.intents };
    },
    // Reset workspace layout (Preferences → DATA & PRIVACY): the REAL
    // `Presenters.resetWorkspaceLayout` shape — clears the stored string,
    // forgets the boot snapshot, resets every created layout machine and
    // dismisses every docked panel (see `createWorkspaceDock`'s
    // `resetWorkspaceLayout`).
    useWorkspaceReset: () => {
      return getWorkspaceDock(world).resetWorkspaceLayout;
    },
    // Per-tab docked-panel membership (Task 4): mirrors
    // `Presenters.dockedPanelIdsFor` — see `useDockedPanelIdsFor`'s doc.
    useDockedPanelIds: (tab: WorkspaceTab) => {
      return useDockedPanelIdsFor(world, tab);
    },
    // Workspace-layout reset counter (Task 4): mirrors
    // `Presenters.workspaceLayoutResets$`, bumped by
    // `workspaceDock.resetWorkspaceLayout`.
    useWorkspaceLayoutResets: () => {
      return useSubject(world.workspaceLayoutResets);
    },
    // Saved layouts (Phase 6b Task 6): the REAL createLayoutPresets
    // controller (getLayoutPresets above), pre-bound to `tab` — every rule
    // lives in the controller, this hook is a direct passthrough.
    useLayoutPresets: (tab: WorkspaceTab) => {
      const controller = getLayoutPresets(world);
      return {
        presets: useObservableNow(
          controller.presetsFor(tab),
          [] as readonly LayoutPresetSummary[],
        ),
        save: (name: string, options?: SaveLayoutPresetOptions) => {
          return controller.save(tab, name, options);
        },
        load: (id: string) => {
          return controller.load(tab, id);
        },
        remove: (id: string) => {
          controller.remove(tab, id);
        },
        resetTab: () => {
          controller.resetTab(tab);
        },
      };
    },
    useRegisterLayoutSnapshot: () => {
      return getLayoutPresets(world).registerSnapshotSource;
    },
    // Boot sequence: no contract spec exercises the boot sequence in Phase 2;
    // use the REAL machine with a fixed "core" variant and noop advance so it
    // compiles and disposes cleanly without touching real preferences.
    useBootSequence: (onDone: () => void) => {
      return useMachine(() => {
        return createBootSequenceMachine({
          variant: "core",
          advance: () => {},
          onDone,
        });
      });
    },
    // Equities: reactive views backed by the World's shared streams (watchlist /
    // orders / positions) and per-symbol subjects (quote / candles / depth) — so a
    // spec seeding `equities: { watchlist, quotes, orders, … }` re-renders the
    // subscribing panel, mirroring the real createViewModel binds.
    useWatchlist: () => {
      return useSubject(world.watchlist);
    },
    useEquityQuote: (symbol: string) => {
      return useSubject(world.equityQuoteFor(symbol));
    },
    // Candles + backfill route through the REAL `CandleSeriesPresenter`
    // (getCandleBridge/getCandleSeries above) — ChartCompare.contract.spec
    // .ts's "ChartPanel pages only the primary…" case drives a real
    // near-edge trigger through ChartPanel and spies on the World's
    // `candleHistory`, so `loadOlderCandles` must reach it for real rather
    // than stay the no-op stub this used to be (ChartBackfill.contract.spec
    // .ts still covers the trigger's own logic by mounting CandleChart
    // directly with props).
    useCandles: (symbol: string, timeframe?: CandleTimeframe) => {
      return useSubject(getCandleBridge(world, symbol, timeframe).candles$);
    },
    useCandleBackfill: (symbol: string, timeframe?: CandleTimeframe) => {
      return useSubject(getCandleBridge(world, symbol, timeframe).backfill$);
    },
    loadOlderCandles: (symbol: string, timeframe?: CandleTimeframe): void => {
      getCandleSeries(world).loadOlder(symbol, timeframe);
    },
    useDepth: (symbol: string) => {
      return useSubject(world.depthFor(symbol));
    },
    useEquityOrders: () => {
      return useSubject(world.equityOrders);
    },
    useEquityPositions: () => {
      return useSubject(world.equityPositions);
    },
    // Machine: the REAL createOrderTicketMachine, driven by a World-backed place()
    // that returns the lifecycle Subject. A spec drives setQty/submit through the
    // ticket's intents (editing→submitting), then pushOrderLifecycle emits
    // working/partiallyFilled/filled orders — exercising the relocated place
    // lifecycle through the same useMachine bridge the app uses.
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
    // Eq workspace: the REAL createEqWorkspaceMachine, one shared instance for
    // the whole World (world.eqWorkspace) — NOT a per-mount useMachine, so
    // every component reading useEqWorkspace() through this World observes the
    // same selection/open-tabs/timeframe, mirroring the app's composition-root
    // singleton wiring.
    useEqWorkspace: () => {
      const state = useMachineState(world.eqWorkspace.state$);
      return {
        state,
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
    // Eq drawings: the REAL createEqDrawingsMachine, one shared instance for
    // the whole World (world.eqDrawings) — mirrors useEqWorkspace above,
    // NOT a per-mount useMachine, so the chart head's draw-tool pills and
    // the plot's committed drawings, even mounted via separate mountWith()
    // calls sharing one World, observe the same tool/drawings/selection.
    useEqDrawings: () => {
      const state = useMachineState(world.eqDrawings.state$);
      return {
        state,
        setTool: world.eqDrawings.intents.setTool,
        addDrawing: world.eqDrawings.intents.addDrawing,
        selectDrawing: world.eqDrawings.intents.selectDrawing,
        deleteSelected: world.eqDrawings.intents.deleteSelected,
        shiftAnchors: world.eqDrawings.intents.shiftAnchors,
        updateDrawing: world.eqDrawings.intents.updateDrawing,
      };
    },
    // Jarvis: the REAL createJarvisMachine (Task 9), cached once per World
    // (getJarvisMachine above) and bridged through useMachineState exactly
    // like the shared eqWorkspace machine above — so JarvisOrb and
    // JarvisOverlay, even mounted via separate mountWith() calls sharing one
    // World, observe the same open/phase/entries/pendingConfirmation.
    useJarvis: () => {
      const machine = getJarvisMachine(world);
      const state = useMachineState(machine.state$);
      return { state, ...machine.intents };
    },
    // The two Jarvis desk-assistant preferences (Task 10): reactive reads
    // off World.jarvisBrain/jarvisEffort, writes recorded so a spec can
    // assert what the user actually chose — mirrors useLoginWaitPreferences
    // exactly, and feeds the SAME subjects getJarvisMachine's
    // preferredBrain$/effort$ read above, so a write through this seam
    // re-resolves the real machine's effectiveBrain.
    useJarvisPreferences: () => {
      return {
        brain: useSubject(world.jarvisBrain),
        setBrain: (brain: JarvisBrain) => {
          world.commands.jarvisBrainSets.push(brain);
          world.jarvisBrain.next(brain);
        },
        effort: useSubject(world.jarvisEffort),
        setEffort: (effort: JarvisEffort) => {
          world.commands.jarvisEffortSets.push(effort);
          world.jarvisEffort.next(effort);
        },
        narrator: useSubject(world.jarvisNarrator),
        setNarrator: (preference: JarvisNarratorPreference) => {
          world.commands.jarvisNarratorSets.push(preference);
          world.jarvisNarrator.next(preference);
        },
      };
    },
    // Jarvis token-usage/cost telemetry (Task 10): reactive view backed by
    // the World subject, mirroring useTopology.
    useJarvisUsage: () => {
      return useSubject(world.jarvisUsage$);
    },
    // Generative-UI desk panels (Task 9): the REAL JarvisPanelsPresenter,
    // fed by the same jarvis.events$ the REAL JarvisMachine above emits —
    // see getJarvisPanelsBridge's doc for the full wiring. dockedPanels/
    // floatingPanels are the same rows pre-split by `.docked`, mirroring
    // JarvisPanelsPresenter.dockedPanels$/floatingPanels$; dismissPanel/
    // dockPanel/undockPanel are the LAYOUT-TREE-INTEGRATED bridges
    // (`Presenters.dismissPanel`/`dockPanel`/`undockPanel`), so a pin from
    // the floating card's 📌 really does insert a leaf into the active tab.
    useJarvisPanels: () => {
      const bridge = getJarvisPanelsBridge(world);
      const dock = getWorkspaceDock(world);
      const panels = useSubject(bridge.panels$);
      return {
        panels,
        dockedPanels: panels.filter((panel) => {
          return panel.docked;
        }),
        floatingPanels: panels.filter((panel) => {
          return !panel.docked;
        }),
        dismissPanel: (panelId: string) => {
          dock.dismissPanel(panelId);
        },
        dockPanel: (panelId: string) => {
          dock.dockPanel(panelId);
        },
        undockPanel: (panelId: string) => {
          dock.undockPanel(panelId);
        },
      };
    },
    useJarvisPanelData: (panelId: string) => {
      const bridge = getJarvisPanelsBridge(world);
      return useSubject(bridge.panelData$(panelId));
    },
    // Jarvis drive-the-app interpreter's outcomes (Task 12/P5): the REAL
    // createJarvisDriverMachine (getJarvisDriverMachine above), one shared
    // instance per World — a driven batch's lastBatch is now genuinely
    // observable, including by HeaderChrome's/AppShell's own driven-pulse
    // cue (useJarvisDrivenPulse.ts).
    useJarvisDriver: () => {
      const driver = getJarvisDriverMachine(world);
      return useMachineState(driver.state$);
    },
    useJarvisDemo: () => {
      const demo = getJarvisDemoMachine(world);
      return {
        state: useMachineState(demo.state$),
        ...demo.intents,
      };
    },
    // The app's active workspace tab (Task 12/P5): the REAL
    // createWorkspaceNavMachine SINGLETON (getWorkspaceNav above), mirroring
    // composition.ts's promoted workspaceNav — reachable now from a driven
    // "switchTab" command, and shared by every component reading
    // useWorkspaceNav() through this World (e.g. a mounted AppShell).
    useWorkspaceNav: () => {
      const machine = getWorkspaceNav(world);
      const state = useMachineState(machine.state$);
      return { state, switchTab: machine.intents.switchTab };
    },
    // Admin / telemetry (Phase 5): World-backed fakes that re-render subscribing
    // components when the test pushes new data. The incident fake mirrors the real
    // IncidentMachine's connection-status asymmetry via world.injectIncident.
    useMetrics: () => {
      return useSubject(world.metrics$);
    },
    useTopology: () => {
      return useSubject(world.topology$);
    },
    useEventLog: () => {
      return useSubject(world.eventLog$);
    },
    useSessions: () => {
      return useSubject(world.sessions$);
    },
    useSessionCountSeries: () => {
      return useSubject(world.sessionCountSeries$);
    },
    useIncident: () => {
      const state = useSubject(world.incidentState$);
      return {
        state,
        inject: (kind: Parameters<typeof world.injectIncident>[0]) => {
          world.injectIncident(kind);
        },
        clear: () => {
          world.clearIncident();
        },
      };
    },
    useCoreSelection: () => {
      const failure = useSubject(world.coreSelectionFailure);
      const current = world.coreImpl.getValue();

      if (current === null) {
        return null;
      }

      return {
        current,
        options: CORE_OPTIONS_FOR_TESTS,
        failure,
        select: (impl: CoreImpl) => {
          if (impl !== world.coreImpl.getValue()) {
            world.commands.coreSelects.push(impl);
          }
        },
      };
    },
    useDemoAccounts: () => {
      return world.demoAccounts;
    },
    takePreferencesReopen: () => {
      return world.takePreferencesReopen();
    },
    peekPreferencesReopen: () => {
      return world.peekPreferencesReopen();
    },
  };
}
