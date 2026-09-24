import {
  createDefaultLayoutPort,
  createLayoutPresetsController,
  createWorkspaceDock,
  InMemoryDockLayoutStore,
  InMemoryLayoutPresetStore,
  type JarvisEvent,
  type PanelStreamDeps,
  type PresetSummaryChannel,
  type WorkspaceSeam,
  writeWorkspaceLayout,
} from "@rtc/client-core";
import type {
  AppPorts,
  DockLayoutStore,
  JarvisPanelsPresenter,
  LayoutIntents,
  LayoutPresetSummary,
  LayoutPresetsPresenter,
  LayoutState,
  Machine,
  PanelInstance,
  Stream,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import { WORKSPACE_PERSIST_DEBOUNCE_MS } from "@rtc/domain";

import { peek, relay } from "#/bridge/in";
import { storeToWarmStateStream, type WarmStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { createStore, type Store } from "#/kernel/store";
import { createLayoutMachine } from "#/machines/layout";
import {
  createJarvisPanelsMachine,
  createJarvisPanelsPresenter,
} from "#/presenters/jarvisPanels";

/** The twelve workspace members this core owns natively (pluggable-core
 * slice 7, wave 1). */
interface NativeWorkspacePresenters {
  readonly dockLayoutStore: DockLayoutStore;
  readonly layoutFor: (
    tab: WorkspaceTab,
  ) => Machine<LayoutState, LayoutIntents>;
  readonly jarvisPanels: JarvisPanelsPresenter;
  readonly dockPanel: (panelId: string) => void;
  readonly dockedPanelIdsFor: (tab: WorkspaceTab) => Stream<readonly string[]>;
  readonly undockPanel: (panelId: string) => void;
  readonly dismissPanel: (panelId: string) => void;
  readonly resetWorkspaceLayout: () => void;
  readonly workspaceLayoutResets$: Stream<number>;
  readonly layoutPresets: LayoutPresetsPresenter;
}

export interface NativeWorkspace {
  readonly presenters: NativeWorkspacePresenters;
  /** What the base app's Jarvis driver drives (`CoreSeams.workspace`). */
  readonly seam: WorkspaceSeam;
  /** `AppCommands.reportDetachedPanels`. */
  reportDetachedPanels(tab: WorkspaceTab, panelIds: readonly string[]): void;
}

export interface NativeWorkspaceDeps {
  readonly ports: AppPorts;
  /** The Jarvis turns' events (the base app's, while `jarvis` delegates). */
  readonly jarvisEvents$: Stream<JarvisEvent>;
  /** This core's own active-tab machine — docking attributes to it. */
  readonly workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;
}

/** The workspace on this core's kernel: the SHARED dock rules
 * (`createWorkspaceDock`), presets controller and payload write from
 * `@rtc/client-core`, wired to Store-backed layout machines and panels
 * roster, with the streams (`dockedPanelIdsFor`, `workspaceLayoutResets$`,
 * the presets lists) and the persistence debounce built here. */
export function createNativeWorkspace(
  deps: NativeWorkspaceDeps,
  lifetime: AbortSignal,
): NativeWorkspace {
  const { ports } = deps;
  const panelStreamDeps: PanelStreamDeps = {
    referenceData: ports.referenceData,
    pricing: ports.pricing,
    blotter: ports.blotter,
    analytics: ports.analytics,
  };
  const panelsMachine = createJarvisPanelsMachine(deps.jarvisEvents$, lifetime);
  const jarvisPanels = createJarvisPanelsPresenter(
    panelsMachine,
    panelStreamDeps,
    lifetime,
  );

  const dockLayoutStore =
    ports.dockLayoutStore ?? new InMemoryDockLayoutStore();
  const membership = createStore(0);
  const resets = createStore(0);
  const resets$ = storeToWarmStateStream(resets);
  const handles = new Map<WorkspaceTab, Machine<LayoutState, LayoutIntents>>();
  const persist = createPersistDebounce(() => {
    writeWorkspaceLayout({
      readStoredLayout: readStoredLayout,
      writeStoredLayout: (value: string) => {
        ports.preferences.setWorkspaceLayout(value);
      },
      createdLayouts: dock.createdLayouts,
      dockedPanels: dock.dockedPlacements,
    });
  }, lifetime);

  let activeTab: WorkspaceTab = "fx";
  relay(deps.workspaceNav.state$, lifetime, (nav) => {
    activeTab = nav.activeTab;
  }).catch(reportAsync);

  function readStoredLayout(): string | null {
    return peek(ports.preferences.workspaceLayout$(), null);
  }

  const dock = createWorkspaceDock({
    panels: {
      current: (): readonly PanelInstance[] => {
        return panelsMachine.store.get().panels;
      },
      dock: panelsMachine.dock,
      undock: panelsMachine.undock,
      dismiss: panelsMachine.dismiss,
      restore: panelsMachine.restore,
    },
    layoutFor,
    activeTab: (): WorkspaceTab => {
      return activeTab;
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

  function bumpResets(): void {
    resets.set((n) => {
      return n + 1;
    });
  }

  /** The per-tab singleton: created on first request, seeded from the
   * stored tree, recording its state into the shared dock SYNCHRONOUSLY
   * (the Store's `subscribe` replays at once) and kicking the writer on
   * every later change — merely opening a tab is not a change. The handle's
   * `dispose` is inert: a consumer must never tear down the singleton. */
  function layoutFor(tab: WorkspaceTab): Machine<LayoutState, LayoutIntents> {
    const existing = handles.get(tab);

    if (existing) {
      return existing;
    }

    const machine = createLayoutMachine(
      createDefaultLayoutPort(tab).initial,
      dock.seedFor(tab),
      lifetime,
    );
    let replayed = false;
    machine.store.subscribe((state) => {
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

  // Boot-time rehydration, before the panels subscription below: a restore
  // is not a change worth persisting.
  dock.restorePersistedDocks();

  let lastPanels = panelsMachine.store.get().panels;
  panelsMachine.store.subscribe((state) => {
    // A fresh state object with the SAME `panels` array is a no-op intent
    // (a rejected dock, an unknown id): not a change worth persisting.
    if (state.panels !== lastPanels) {
      lastPanels = state.panels;
      persist.kick();
    }
  });

  const dockedByTab = new Map<
    WorkspaceTab,
    WarmStateStream<readonly string[]>
  >();

  /** One tab's docked membership: recomputed on every roster change AND on
   * every attribution change (the roster flips `docked` before the dock
   * attributes the panel to a tab), sorted, and written only when the ids
   * differ element-wise. */
  function dockedPanelIdsFor(tab: WorkspaceTab): Stream<readonly string[]> {
    const existing = dockedByTab.get(tab);

    if (existing) {
      return existing.state$;
    }

    const ids = createStore<readonly string[]>(currentDockedIds(tab));

    function recompute(): void {
      const next = currentDockedIds(tab);
      const previous = ids.get();

      if (
        next.length !== previous.length ||
        next.some((id, index) => {
          return id !== previous[index];
        })
      ) {
        ids.set(next);
      }
    }

    const stopPanels = panelsMachine.store.subscribe(recompute);
    const stopMembership = membership.subscribe(recompute);
    const warm = storeToWarmStateStream(ids);
    lifetime.addEventListener(
      "abort",
      () => {
        stopPanels();
        stopMembership();
        warm.release();
      },
      { once: true },
    );
    dockedByTab.set(tab, warm);
    return warm.state$;
  }

  function currentDockedIds(tab: WorkspaceTab): readonly string[] {
    return dock.dockedIdsIn(tab, panelsMachine.store.get().panels).sort();
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
    createStoreSummaryChannel(lifetime),
  );

  const livePanelIds = createStore<readonly string[]>([]);
  const dockedPanelIds = createStore<readonly string[]>([]);
  panelsMachine.store.subscribe((state) => {
    livePanelIds.set(
      state.panels.map((panel) => {
        return panel.panelId;
      }),
    );
    dockedPanelIds.set(
      state.panels
        .filter((panel) => {
          return panel.docked;
        })
        .map((panel) => {
          return panel.panelId;
        }),
    );
  });
  const livePanelIds$ = storeToWarmStateStream(livePanelIds);
  const dockedPanelIds$ = storeToWarmStateStream(dockedPanelIds);

  lifetime.addEventListener(
    "abort",
    () => {
      resets$.release();
      livePanelIds$.release();
      dockedPanelIds$.release();
    },
    { once: true },
  );

  return {
    presenters: {
      dockLayoutStore,
      layoutFor,
      jarvisPanels,
      dockPanel: dock.dockPanel,
      dockedPanelIdsFor,
      undockPanel: dock.undockPanel,
      dismissPanel: dock.dismissPanel,
      resetWorkspaceLayout: dock.resetWorkspaceLayout,
      workspaceLayoutResets$: resets$.state$,
      layoutPresets,
    },
    seam: {
      layoutFor,
      dockPanel: dock.dockPanel,
      undockPanel: dock.undockPanel,
      dismissPanel: dock.dismissPanel,
      livePanelIds$: livePanelIds$.state$,
      dockedPanelIds$: dockedPanelIds$.state$,
      detachedPanelIds: dock.detachedPanelIds,
    },
    reportDetachedPanels: dock.reportDetachedPanels,
  };
}

interface PersistDebounce {
  /** (Re)start the quiet window; the write runs once it elapses. */
  kick(): void;
}

/** The writer's debounce: each kick aborts the pending
 * `WORKSPACE_PERSIST_DEBOUNCE_MS` sleep and starts a fresh one, so only an
 * uninterrupted window writes. */
function createPersistDebounce(
  write: () => void,
  lifetime: AbortSignal,
): PersistDebounce {
  let pending: AbortController | null = null;

  lifetime.addEventListener(
    "abort",
    () => {
      pending?.abort();
    },
    { once: true },
  );

  return {
    kick: () => {
      if (lifetime.aborted) {
        return;
      }

      pending?.abort();
      const window = new AbortController();
      pending = window;
      sleep(WORKSPACE_PERSIST_DEBOUNCE_MS, window.signal).then(
        () => {
          // A superseded window rejects (the next kick aborted its sleep).
          // A kick or the lifetime's end can still land between the timer
          // and this callback: never orphan the newer window, never write
          // after the end.
          if (pending === window) {
            pending = null;
          }

          if (!lifetime.aborted) {
            write();
          }
        },
        (error: unknown) => {
          if (!(error instanceof AbortError)) {
            reportAsync(error);
          }
        },
      );
    },
  };
}

interface SummaryEntry {
  readonly store: Store<readonly LayoutPresetSummary[]>;
  readonly warm: WarmStateStream<readonly LayoutPresetSummary[]>;
}

/** The presets summaries as one warm Store per tab. */
function createStoreSummaryChannel(
  lifetime: AbortSignal,
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

    const store = createStore(initial());
    const entry = { store, warm: storeToWarmStateStream(store) };
    byTab.set(tab, entry);
    return entry;
  }

  lifetime.addEventListener(
    "abort",
    () => {
      for (const entry of byTab.values()) {
        entry.warm.release();
      }
    },
    { once: true },
  );

  return {
    streamFor: (
      tab: WorkspaceTab,
      initial: () => readonly LayoutPresetSummary[],
    ): Stream<readonly LayoutPresetSummary[]> => {
      return entryFor(tab, initial).warm.state$;
    },
    publish: (
      tab: WorkspaceTab,
      summaries: readonly LayoutPresetSummary[],
    ): void => {
      entryFor(tab, () => {
        return summaries;
      }).store.set(summaries);
    },
  };
}
