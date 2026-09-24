import { Effect, Option, Stream } from "effect";

import {
  analyticsTableFrame,
  appendTickPoint,
  applyPanelEvent,
  blotterTableFrame,
  dismissPanelInState,
  dockPanelInState,
  type Frame,
  historySeries,
  isPanelEvent,
  type JarvisEvent,
  type NamedSeries,
  type PanelStreamDeps,
  renderPanelFrame,
  restoreDockedPanelInState,
  seriesFrame,
  undockPanelInState,
  unknownSourceFrame,
} from "@rtc/client-core";
import type {
  Stream as CoreStream,
  JarvisPanelsPresenter,
  JarvisPanelsState,
  JarvisPanelVm,
  PanelData,
  PanelInstance,
  PanelPoint,
} from "@rtc/core-api";
import { AnalyticsUseCase, TradeBlotterUseCase } from "@rtc/domain";

import {
  type EffectHost,
  emptyStream,
  type FoldUpdate,
  type FromPort,
  fromPortIn,
  holdWarm,
  scopedPortStream,
  sharedFold,
} from "#/bridge/out";
import { peekCurrent } from "#/bridge/peek";
import { createSyncRef, type SyncRef } from "#/presenters/syncRef";

/** A desk panel's spec — `@rtc/shared`'s `PanelSpecV1`, which this package
 * does not depend on. */
type PanelSpecV1 = NonNullable<PanelInstance["spec"]>;
type PanelSource = PanelSpecV1["source"];

/** The desk-panels roster: a `SyncRef` folded by the SHARED folds
 * (`@rtc/client-core`'s `jarvisPanelsFolds`), fed the `panel` events of the
 * Jarvis turns it is handed on a fiber of the host scope. Every intent
 * commits synchronously (the workspace's synchronous-fold contract), and —
 * as in the RxJS machine — writes a FRESH state object even when the fold
 * changed nothing, so a consumer that cares about real change compares the
 * `panels` array. */
export interface JarvisPanelsMachine {
  readonly ref: SyncRef<JarvisPanelsState>;
  dock(panelId: string): void;
  undock(panelId: string): void;
  dismiss(panelId: string): void;
  restore(panelId: string, spec: PanelSpecV1): void;
}

export function createJarvisPanelsMachine(
  host: EffectHost,
  events$: CoreStream<JarvisEvent>,
): JarvisPanelsMachine {
  const ref = createSyncRef<JarvisPanelsState>(host, { panels: [] });

  function foldPanels(
    step: (panels: readonly PanelInstance[]) => readonly PanelInstance[],
  ): void {
    ref.set((state) => {
      return { ...state, panels: step(state.panels) };
    });
  }

  // `fromPortIn` subscribes the events NOW, at construction, buffering until
  // the fiber below drains them: the base's `jarvis.events$` is hot, and a
  // turn sent before a lazily-subscribing fiber had started would be lost.
  host.runtime.runFork(
    fromPortIn(host.scope)(events$).pipe(
      Stream.runForEach((event) => {
        return Effect.sync(() => {
          if (isPanelEvent(event)) {
            foldPanels((panels) => {
              return applyPanelEvent(panels, event);
            });
          }
        });
      }),
    ),
    { scope: host.scope },
  );

  return {
    ref,
    dock: (panelId: string) => {
      foldPanels((panels) => {
        return dockPanelInState(panels, panelId);
      });
    },
    undock: (panelId: string) => {
      foldPanels((panels) => {
        return undockPanelInState(panels, panelId);
      });
    },
    dismiss: (panelId: string) => {
      foldPanels((panels) => {
        return dismissPanelInState(panels, panelId);
      });
    },
    restore: (panelId: string, spec: PanelSpecV1) => {
      foldPanels((panels) => {
        return restoreDockedPanelInState(panels, panelId, spec);
      });
    },
  };
}

const UNSUPPORTED_TITLE = "Unsupported panel";

/** An unsupported (or not-yet-cached) panel's data: ONE constant, as the
 * RxJS presenter's `EMPTY`. */
const NO_PANEL_DATA: CoreStream<PanelData> = emptyStream<PanelData>();

interface PanelCacheEntry {
  readonly spec: PanelSpecV1;
  readonly data$: CoreStream<PanelData>;
  readonly release: () => void;
}

/** A presenter plus the release of everything it holds warm. */
export interface OwnedJarvisPanelsPresenter {
  readonly presenter: JarvisPanelsPresenter;
  release(): void;
}

/** The presenter over the roster: the VM rows (and their docked / floating
 * partitions) as warm state streams, one warm `sharedFold` per LIVE panel —
 * rebuilt when its spec changes, released when it leaves — and `panelData$`
 * as a per-id `sharedFold` that follows the roster to that panel's data. */
export function createJarvisPanelsPresenter(
  host: EffectHost,
  machine: JarvisPanelsMachine,
  deps: PanelStreamDeps,
): OwnedJarvisPanelsPresenter {
  const cache = new Map<string, PanelCacheEntry>();
  const panelDataCache = new Map<string, CoreStream<PanelData | null>>();
  const rows = createSyncRef<readonly JarvisPanelVm[]>(host, []);
  const docked = createSyncRef<readonly JarvisPanelVm[]>(host, []);
  const floating = createSyncRef<readonly JarvisPanelVm[]>(host, []);

  const unlisten = machine.ref.listen((state) => {
    syncCache(state.panels);
    const vms = state.panels.map((panel) => {
      return toPanelVm(panel);
    });
    rows.set(() => {
      return vms;
    });
    docked.set(() => {
      return vms.filter((row) => {
        return row.docked;
      });
    });
    floating.set(() => {
      return vms.filter((row) => {
        return !row.docked;
      });
    });
  });

  const rows$ = rows.warm();
  const docked$ = docked.warm();
  const floating$ = floating.warm();

  function toPanelVm(panel: PanelInstance): JarvisPanelVm {
    if (panel.status === "unsupported" || !panel.spec) {
      return {
        panelId: panel.panelId,
        title: UNSUPPORTED_TITLE,
        rationale: null,
        status: "unsupported",
        vizKind: null,
        data$: NO_PANEL_DATA,
        docked: panel.docked,
      };
    }

    return {
      panelId: panel.panelId,
      title: panel.spec.title,
      rationale: panel.spec.rationale ?? null,
      status: "live",
      vizKind: panel.spec.viz.kind,
      data$: cache.get(panel.panelId)?.data$ ?? NO_PANEL_DATA,
      docked: panel.docked,
    };
  }

  function syncCache(panels: readonly PanelInstance[]): void {
    const liveIds = new Set(
      panels
        .filter((panel) => {
          return panel.status === "live";
        })
        .map((panel) => {
          return panel.panelId;
        }),
    );

    for (const [panelId, entry] of cache) {
      if (!liveIds.has(panelId)) {
        entry.release();
        cache.delete(panelId);
      }
    }

    for (const panel of panels) {
      if (panel.status !== "live" || !panel.spec) {
        continue;
      }

      const existing = cache.get(panel.panelId);

      if (existing && existing.spec === panel.spec) {
        continue;
      }

      existing?.release();
      const data$ = createPanelData(host, panel.spec, deps);
      cache.set(panel.panelId, {
        spec: panel.spec,
        data$,
        release: holdWarm(data$),
      });
    }
  }

  /** The `switchMap` of the RxJS presenter: a replay-current fold that, on
   * every roster change, follows the named panel's CURRENT data (switching
   * only when that data stream changed), or holds `null` while the panel is
   * unknown / unsupported. */
  function panelData$(panelId: string): CoreStream<PanelData | null> {
    const cached = panelDataCache.get(panelId);

    if (cached) {
      return cached;
    }

    function targetOf(
      vms: readonly JarvisPanelVm[],
    ): CoreStream<PanelData> | null {
      const vm = vms.find((row) => {
        return row.panelId === panelId;
      });
      return vm?.status === "live" ? vm.data$ : null;
    }

    const stream = sharedFold<PanelData | null>(host, {
      seed: () => {
        const target = targetOf(rows.get());
        return target === null ? Option.some(null) : peekCurrent(target);
      },
      run: (update: FoldUpdate<PanelData | null>, fromPort: FromPort) => {
        return fromPort(rows$.state$).pipe(
          Stream.map(targetOf),
          Stream.changes,
          Stream.flatMap(
            (target) => {
              return target === null
                ? Stream.make(null)
                : scopedPortStream(() => {
                    return target;
                  });
            },
            { switch: true },
          ),
          Stream.runForEach((data) => {
            return update(() => {
              return data;
            });
          }),
        );
      },
    });
    panelDataCache.set(panelId, stream);
    return stream;
  }

  return {
    presenter: {
      panels$: rows$.state$,
      dockedPanels$: docked$.state$,
      floatingPanels$: floating$.state$,
      dismissPanel: machine.dismiss,
      restoreDockedPanel: machine.restore,
      panelData$,
    },
    release: () => {
      unlisten();
      rows$.release();
      docked$.release();
      floating$.release();

      for (const entry of cache.values()) {
        entry.release();
      }

      cache.clear();
    },
  };
}

/** One desk panel's interpreted data: its source's port streams, folded by
 * the SHARED per-source steps (`@rtc/client-core`'s `panelFrames`), through
 * the spec's transforms and viz — a `sharedFold`, the RxJS
 * `shareReplay({ refCount: true })`. A multi-symbol source publishes once
 * every symbol has a series (`Stream.zipLatestAll`, `combineLatest`'s
 * rule). */
function createPanelData(
  host: EffectHost,
  spec: PanelSpecV1,
  deps: PanelStreamDeps,
): CoreStream<PanelData> {
  return sharedFold<PanelData>(host, {
    seed: () => {
      return Option.none();
    },
    run: (update: FoldUpdate<PanelData>, fromPort: FromPort) => {
      return sourceFrames(spec.source, deps, fromPort).pipe(
        Stream.runForEach((frame) => {
          return update(() => {
            return renderPanelFrame(spec, frame);
          });
        }),
      );
    },
  });
}

function sourceFrames(
  source: PanelSource,
  deps: PanelStreamDeps,
  fromPort: FromPort,
): Stream.Stream<Frame, unknown> {
  switch (source.kind) {
    case "fxTicks":
      return Stream.zipLatestAll(
        ...source.symbols.map((symbol) => {
          return fromPort(deps.pricing.getPriceUpdates(symbol)).pipe(
            Stream.mapAccum(
              [] as readonly PanelPoint[],
              (points, tick): [readonly PanelPoint[], NamedSeries] => {
                const next = appendTickPoint(points, tick);
                return [next, { label: symbol, points: next }];
              },
            ),
          );
        }),
      ).pipe(Stream.map(seriesFrame));

    case "priceHistory":
      return Stream.zipLatestAll(
        ...source.symbols.map((symbol) => {
          return fromPort(deps.pricing.getPriceHistory(symbol)).pipe(
            Stream.map((ticks) => {
              return historySeries(symbol, ticks);
            }),
          );
        }),
      ).pipe(Stream.map(seriesFrame));

    case "analytics":
      return fromPort(new AnalyticsUseCase(deps.analytics).execute()).pipe(
        Stream.map(analyticsTableFrame),
      );

    case "blotter":
      return fromPort(new TradeBlotterUseCase(deps.blotter).execute()).pipe(
        Stream.map(blotterTableFrame),
      );

    default:
      return Stream.make(unknownSourceFrame(source));
  }
}
