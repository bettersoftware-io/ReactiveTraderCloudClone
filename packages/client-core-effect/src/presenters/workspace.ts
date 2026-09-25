import { Effect, Fiber, Scope } from "effect";

import {
  createDefaultLayoutPort,
  createLayoutPresetsController,
  createWorkspaceDock,
  type DriveCommandDeps,
  InMemoryDockLayoutStore,
  InMemoryLayoutPresetStore,
  type JarvisEvent,
  type PanelStreamDeps,
  type PresetSummaryChannel,
  writeWorkspaceLayout,
} from "@rtc/client-core";
import type {
  AppPorts,
  Stream as CoreStream,
  DockLayoutStore,
  JarvisPanelsPresenter,
  LayoutIntents,
  LayoutPresetSummary,
  LayoutPresetsPresenter,
  LayoutState,
  Machine,
  PanelInstance,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import { WORKSPACE_PERSIST_DEBOUNCE_MS } from "@rtc/domain";

import {
  createChildHost,
  type EffectHost,
  type WarmStateStream,
} from "#/bridge/out";
import { peek } from "#/bridge/peek";
import { createLayoutMachine } from "#/machines/layout";
import {
  createJarvisPanelsMachine,
  createJarvisPanelsPresenter,
} from "#/presenters/jarvisPanels";
import { createSyncRef, type SyncRef } from "#/presenters/syncRef";

/** The twelve workspace members this core owns natively (pluggable-core
 * slice 7, wave 1). */
interface NativeWorkspacePresenters {
  readonly dockLayoutStore: DockLayoutStore;
  readonly layoutFor: (
    tab: WorkspaceTab,
  ) => Machine<LayoutState, LayoutIntents>;
  readonly jarvisPanels: JarvisPanelsPresenter;
  readonly dockPanel: (panelId: string) => void;
  readonly dockedPanelIdsFor: (
    tab: WorkspaceTab,
  ) => CoreStream<readonly string[]>;
  readonly undockPanel: (panelId: string) => void;
  readonly dismissPanel: (panelId: string) => void;
  readonly resetWorkspaceLayout: () => void;
  readonly workspaceLayoutResets$: CoreStream<number>;
  readonly layoutPresets: LayoutPresetsPresenter;
}

/** What the Jarvis driver reaches in this workspace, read and written
 * synchronously (`DriveCommandDeps`, client-core). */
type WorkspaceDriveDeps = Pick<
  DriveCommandDeps,
  | "layout"
  | "dockPanel"
  | "undockPanel"
  | "dismissPanel"
  | "livePanelIds"
  | "dockedPanelIds"
  | "detachedPanelIds"
>;

export interface NativeWorkspace {
  readonly presenters: NativeWorkspacePresenters;
  /** What this core's own Jarvis driver drives. */
  readonly drive: WorkspaceDriveDeps;
  /** `AppCommands.reportDetachedPanels`. */
  reportDetachedPanels(tab: WorkspaceTab, panelIds: readonly string[]): void;
}

export interface NativeWorkspaceDeps {
  readonly ports: AppPorts;
  /** The Jarvis turns' events — this core's own `jarvis.events$`. */
  readonly jarvisEvents$: CoreStream<JarvisEvent>;
  /** This core's own active-tab machine — docking attributes to it. */
  readonly workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;
}

/** The workspace on the Effect core: the SHARED dock rules
 * (`createWorkspaceDock`), presets controller and payload write from
 * `@rtc/client-core`, wired to `SyncRef`-backed layout machines and panels
 * roster — `SubscriptionRef`s committed with `runSync`, their in-core mirrors
 * notified synchronously (the workspace's synchronous-fold contract) — with
 * the streams (`dockedPanelIdsFor`, `workspaceLayoutResets$`, the presets
 * lists) as warm refs and the persistence debounce as an `Effect.sleep`
 * fiber. Everything lives on a CHILD of the app host: its scope's close (the
 * app's `dispose()`) interrupts the relays and the pending write, and
 * releases every keep-warm.
 *
 * Built outside the Layer graph, with the rest of the Jarvis family
 * (`presenters/jarvisFamily.ts`), over this core's own `jarvis.events$`
 * (slice 7 wave 2; wave 1's `CoreSeams.workspace` factory is deleted). */
export function createNativeWorkspace(
  parent: EffectHost,
  deps: NativeWorkspaceDeps,
): NativeWorkspace {
  const host = createChildHost(parent);
  const { ports } = deps;
  // Everything the workspace holds is released when the host scope closes
  // (the app's `dispose()`); anything created AFTER that is released at once
  // — a late `layoutFor(tab)` must not leak a keep-warm into a drained list.
  const releases: (() => void)[] = [];
  let closed = false;

  function track(release: () => void): void {
    if (closed) {
      release();
      return;
    }

    releases.push(release);
  }

  const panelStreamDeps: PanelStreamDeps = {
    referenceData: ports.referenceData,
    pricing: ports.pricing,
    blotter: ports.blotter,
    analytics: ports.analytics,
  };
  const panelsMachine = createJarvisPanelsMachine(host, deps.jarvisEvents$);
  const jarvisPanels = createJarvisPanelsPresenter(
    host,
    panelsMachine,
    panelStreamDeps,
  );
  track(jarvisPanels.release);
  const dockLayoutStore =
    ports.dockLayoutStore ?? new InMemoryDockLayoutStore();
  const membership = createSyncRef(host, 0);
  const resets = createSyncRef(host, 0);
  const resets$ = resets.warm();
  track(resets$.release);
  const handles = new Map<WorkspaceTab, Machine<LayoutState, LayoutIntents>>();
  const persist = createPersistDebounce(
    host,
    () => {
      return closed;
    },
    () => {
      writeWorkspaceLayout({
        readStoredLayout,
        writeStoredLayout: (value: string) => {
          ports.preferences.setWorkspaceLayout(value);
        },
        createdLayouts: dock.createdLayouts,
        dockedPanels: dock.dockedPlacements,
      });
    },
  );

  function readStoredLayout(): string | null {
    return peek(ports.preferences.workspaceLayout$(), null);
  }

  function bumpResets(): void {
    resets.set((n) => {
      return n + 1;
    });
  }

  const dock = createWorkspaceDock({
    panels: {
      current: (): readonly PanelInstance[] => {
        return panelsMachine.ref.get().panels;
      },
      dock: panelsMachine.dock,
      undock: panelsMachine.undock,
      dismiss: panelsMachine.dismiss,
      restore: panelsMachine.restore,
    },
    layoutFor,
    activeTab: (): WorkspaceTab => {
      return peek<WorkspaceNavState>(deps.workspaceNav.state$, {
        activeTab: "fx",
      }).activeTab;
    },
    readStoredLayout,
    clearStoredLayout: (): void => {
      ports.preferences.setWorkspaceLayout(null);
    },
    dockLayoutStore,
    onDockedMembershipChange: (): void => {
      membership.set((n) => {
        return n + 1;
      });
    },
    onResetsBump: bumpResets,
  });

  /** The per-tab singleton: created on first request, seeded from the
   * stored tree, recording its state into the shared dock SYNCHRONOUSLY
   * (`listen` replays at once) and kicking the writer on every later change
   * — merely opening a tab is not a change. The handle's `dispose` is
   * inert: a consumer must never tear down the singleton. */
  function layoutFor(tab: WorkspaceTab): Machine<LayoutState, LayoutIntents> {
    const existing = handles.get(tab);

    if (existing) {
      return existing;
    }

    const machine = createLayoutMachine(
      host,
      createDefaultLayoutPort(tab).initial,
      dock.seedFor(tab),
    );
    track(machine.dispose);
    let replayed = false;
    machine.ref.listen((state) => {
      dock.recordLayoutState(tab, state);

      if (replayed) {
        persist.kick();
      }

      replayed = true;
    });

    const handle: Machine<LayoutState, LayoutIntents> = {
      state$: machine.state$,
      intents: machine.intents,
      dispose: () => {
        // Deliberately inert — this workspace owns the machine's lifetime.
      },
    };
    handles.set(tab, handle);
    return handle;
  }

  // Boot-time rehydration, before the panels listener below: a restore is
  // not a change worth persisting.
  dock.restorePersistedDocks();

  let lastPanels = panelsMachine.ref.get().panels;
  const unlistenKicks = panelsMachine.ref.listen((state) => {
    // A fresh state object with the SAME `panels` array is a no-op intent
    // (a rejected dock, an unknown id): not a change worth persisting.
    if (state.panels !== lastPanels) {
      lastPanels = state.panels;
      persist.kick();
    }
  });
  track(unlistenKicks);

  const dockedByTab = new Map<
    WorkspaceTab,
    WarmStateStream<readonly string[]>
  >();

  function currentDockedIds(tab: WorkspaceTab): readonly string[] {
    return dock.dockedIdsIn(tab, panelsMachine.ref.get().panels).sort();
  }

  /** One tab's docked membership: recomputed on every roster change AND on
   * every attribution change (the roster flips `docked` before the dock
   * attributes the panel to a tab), sorted, and written only when the ids
   * differ element-wise. */
  function dockedPanelIdsFor(tab: WorkspaceTab): CoreStream<readonly string[]> {
    const existing = dockedByTab.get(tab);

    if (existing) {
      return existing.state$;
    }

    const ids = createSyncRef<readonly string[]>(host, currentDockedIds(tab));

    function recompute(): void {
      const next = currentDockedIds(tab);
      ids.set((previous) => {
        return next.length === previous.length &&
          next.every((id, index) => {
            return id === previous[index];
          })
          ? previous
          : next;
      });
    }

    track(panelsMachine.ref.listen(recompute));
    track(membership.listen(recompute));
    const warm = ids.warm();
    track(warm.release);
    dockedByTab.set(tab, warm);
    return warm.state$;
  }

  const layoutPresets = createLayoutPresetsController(
    {
      store: ports.layoutPresetStore ?? new InMemoryLayoutPresetStore(),
      dockLayoutStore,
      layoutFor,
      layoutStateNow: dock.layoutStateNow,
      dockedPanelIdsNow: dock.dockedPanelIdsNow,
      rebuildLiveEngine: bumpResets,
    },
    createRefSummaryChannel(host, track),
  );

  function livePanelIdsNow(): readonly string[] {
    return panelsMachine.ref.get().panels.map((panel) => {
      return panel.panelId;
    });
  }

  function dockedPanelIdsNow(): readonly string[] {
    return panelsMachine.ref
      .get()
      .panels.filter((panel) => {
        return panel.docked;
      })
      .map((panel) => {
        return panel.panelId;
      });
  }

  host.runtime.runSync(
    Scope.addFinalizer(
      host.scope,
      Effect.sync(() => {
        closed = true;

        for (const release of releases.splice(0)) {
          release();
        }
      }),
    ),
  );

  return {
    presenters: {
      dockLayoutStore,
      layoutFor,
      jarvisPanels: jarvisPanels.presenter,
      dockPanel: dock.dockPanel,
      dockedPanelIdsFor,
      undockPanel: dock.undockPanel,
      dismissPanel: dock.dismissPanel,
      resetWorkspaceLayout: dock.resetWorkspaceLayout,
      workspaceLayoutResets$: resets$.state$,
      layoutPresets,
    },
    drive: {
      layout: layoutFor,
      dockPanel: dock.dockPanel,
      undockPanel: dock.undockPanel,
      dismissPanel: dock.dismissPanel,
      livePanelIds: livePanelIdsNow,
      dockedPanelIds: dockedPanelIdsNow,
      detachedPanelIds: dock.detachedPanelIds,
    },
    reportDetachedPanels: dock.reportDetachedPanels,
  };
}

interface PersistDebounce {
  /** (Re)start the quiet window; the write runs once it elapses. */
  kick(): void;
}

/** The writer's debounce: each kick interrupts the pending
 * `WORKSPACE_PERSIST_DEBOUNCE_MS` sleep fiber and forks a fresh one in the
 * host scope, so only an uninterrupted window writes — and the scope's
 * close (the app's `dispose()`) interrupts a pending one. */
function createPersistDebounce(
  host: EffectHost,
  isClosed: () => boolean,
  write: () => void,
): PersistDebounce {
  let pending: Fiber.RuntimeFiber<void> | null = null;

  return {
    kick: () => {
      // After the host scope closed, a fork would run in an already-closed
      // child scope and still write: a kick after `dispose()` is a no-op.
      if (isClosed()) {
        return;
      }

      // `Fiber.interrupt` is itself scheduled: a window whose timer already
      // fired can still write once — reading LIVE state, so identical to the
      // write the new window will make (one extra write, never a stale one).
      if (pending !== null) {
        Effect.runFork(Fiber.interrupt(pending));
      }

      pending = host.runtime.runFork(
        Effect.sleep(WORKSPACE_PERSIST_DEBOUNCE_MS).pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (!isClosed()) {
                write();
              }
            }),
          ),
        ),
        { scope: host.scope },
      );
    },
  };
}

interface SummaryEntry {
  readonly ref: SyncRef<readonly LayoutPresetSummary[]>;
  readonly warm: WarmStateStream<readonly LayoutPresetSummary[]>;
}

/** The presets summaries as one warm ref per tab. */
function createRefSummaryChannel(
  host: EffectHost,
  track: (release: () => void) => void,
): PresetSummaryChannel {
  const byTab = new Map<WorkspaceTab, SummaryEntry>();

  function entryFor(
    tab: WorkspaceTab,
    initial: () => readonly LayoutPresetSummary[],
  ): SummaryEntry {
    const existing = byTab.get(tab);

    if (existing) {
      return existing;
    }

    const ref = createSyncRef(host, initial());
    const entry = { ref, warm: ref.warm() };
    track(entry.warm.release);
    byTab.set(tab, entry);
    return entry;
  }

  return {
    streamFor: (
      tab: WorkspaceTab,
      initial: () => readonly LayoutPresetSummary[],
    ): CoreStream<readonly LayoutPresetSummary[]> => {
      return entryFor(tab, initial).warm.state$;
    },
    publish: (
      tab: WorkspaceTab,
      summaries: readonly LayoutPresetSummary[],
    ): void => {
      entryFor(tab, () => {
        return summaries;
      }).ref.set(() => {
        return summaries;
      });
    },
  };
}
