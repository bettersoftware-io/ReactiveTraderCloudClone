import type {
  JarvisPanelsPresenter,
  JarvisPanelsState,
  JarvisPanelVm,
  PanelData,
  PanelInstance,
  PanelPoint,
  Stream,
} from "@rtc/core-api";
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
  type NamedSeries,
  type PanelStreamDeps,
  renderPanelFrame,
  restoreDockedPanelInState,
  seriesFrame,
  undockPanelInState,
  unknownSourceFrame,
} from "@rtc/core-logic";
import { AnalyticsUseCase, TradeBlotterUseCase } from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import { relay } from "#/bridge/in";
import {
  emptyStream,
  storeToWarmStateStream,
  topicToStream,
} from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { createStore, type Store } from "#/kernel/store";
import { createTopic, type Topic } from "#/kernel/topic";

/** A desk panel's spec — `@rtc/shared`'s `PanelSpecV1`, which this package
 * does not depend on. */
type PanelSpecV1 = NonNullable<PanelInstance["spec"]>;
type PanelSource = PanelSpecV1["source"];

/** The desk-panels roster: a `Store` folded by the SHARED folds
 * (`@rtc/client-core`'s `jarvisPanelsFolds`), fed the `panel` events of the
 * Jarvis turns it is handed. Every intent commits synchronously (the
 * workspace's synchronous-fold contract), and — as in the RxJS machine —
 * writes a FRESH state object even when the fold changed nothing, so a
 * consumer that cares about real change compares the `panels` array. */
export interface JarvisPanelsMachine {
  readonly store: Store<JarvisPanelsState>;
  dock(panelId: string): void;
  undock(panelId: string): void;
  dismiss(panelId: string): void;
  restore(panelId: string, spec: PanelSpecV1): void;
}

export function createJarvisPanelsMachine(
  events$: Stream<JarvisEvent>,
  lifetime: AbortSignal,
): JarvisPanelsMachine {
  const store = createStore<JarvisPanelsState>({ panels: [] });

  function foldPanels(
    step: (panels: readonly PanelInstance[]) => readonly PanelInstance[],
  ): void {
    store.set((state) => {
      return { ...state, panels: step(state.panels) };
    });
  }

  relay(events$, lifetime, (event) => {
    if (isPanelEvent(event)) {
      foldPanels((panels) => {
        return applyPanelEvent(panels, event);
      });
    }
  }).catch(reportAsync);

  return {
    store,
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
 * RxJS presenter's `EMPTY`, so a consumer keyed on `data$` identity does not
 * re-subscribe on every roster change. */
const NO_PANEL_DATA: Stream<PanelData> = emptyStream<PanelData>();

interface PanelCacheEntry {
  readonly spec: PanelSpecV1;
  readonly data$: Stream<PanelData>;
  readonly release: () => void;
}

/** The presenter over the roster: the VM rows (and their docked / floating
 * partitions) as warm state streams, one warm data topic per LIVE panel —
 * rebuilt when its spec changes, released when it leaves — and `panelData$`
 * as a per-id topic that follows the roster to that panel's data. */
export function createJarvisPanelsPresenter(
  machine: JarvisPanelsMachine,
  deps: PanelStreamDeps,
  lifetime: AbortSignal,
): JarvisPanelsPresenter {
  const cache = new Map<string, PanelCacheEntry>();
  const panelDataCache = new Map<string, Stream<PanelData | null>>();
  const rows = createStore<readonly JarvisPanelVm[]>([]);
  const docked = createStore<readonly JarvisPanelVm[]>([]);
  const floating = createStore<readonly JarvisPanelVm[]>([]);

  const unsubscribe = machine.store.subscribe((state) => {
    syncCache(state.panels);
    const vms = state.panels.map((panel) => {
      return toPanelVm(panel);
    });
    rows.set(vms);
    docked.set(
      vms.filter((row) => {
        return row.docked;
      }),
    );
    floating.set(
      vms.filter((row) => {
        return !row.docked;
      }),
    );
  });

  const rows$ = storeToWarmStateStream(rows);
  const docked$ = storeToWarmStateStream(docked);
  const floating$ = storeToWarmStateStream(floating);

  lifetime.addEventListener(
    "abort",
    () => {
      unsubscribe();
      rows$.release();
      docked$.release();
      floating$.release();

      for (const entry of cache.values()) {
        entry.release();
      }

      cache.clear();
    },
    { once: true },
  );

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
      const topic = createPanelDataTopic(panel.spec, deps);
      const release = topic.subscribe(() => {});
      cache.set(panel.panelId, {
        spec: panel.spec,
        data$: topicToStream(topic),
        release,
      });
    }
  }

  function panelData$(panelId: string): Stream<PanelData | null> {
    const cached = panelDataCache.get(panelId);

    if (cached) {
      return cached;
    }

    const stream = topicToStream(
      createTopic<PanelData | null>(
        (signal, publish) => {
          return followPanelData(panelId, signal, publish);
        },
        { replay: true },
      ),
    );
    panelDataCache.set(panelId, stream);
    return stream;
  }

  /** The `switchMap` of the RxJS presenter: on every roster change, attach
   * to the named panel's CURRENT data (re-attaching only when that data
   * stream changed), or publish `null` while it is unknown / unsupported. */
  function followPanelData(
    panelId: string,
    signal: AbortSignal,
    publish: (value: PanelData | null) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let attached: Stream<PanelData> | null = null;
      let detach: (() => void) | null = null;

      function stop(): void {
        unsubscribeRows();
        detach?.();
        detach = null;
      }

      const unsubscribeRows = rows.subscribe((vms) => {
        const vm = vms.find((row) => {
          return row.panelId === panelId;
        });
        const target = vm?.status === "live" ? vm.data$ : null;

        if (target !== null && target === attached) {
          return;
        }

        detach?.();
        detach = null;
        attached = target;

        if (target === null) {
          publish(null);
          return;
        }

        const attachment = new AbortController();
        // A data stream that FAILS fails this follow too — its subscribers
        // hear the error, as the RxJS presenter's `switchMap` propagates it
        // (the next subscriber starts afresh, re-reading the roster).
        relay(target, attachment.signal, publish).catch((error: unknown) => {
          stop();
          reject(error);
        });

        detach = (): void => {
          attachment.abort();
        };
      });

      signal.addEventListener(
        "abort",
        () => {
          stop();
          resolve();
        },
        { once: true },
      );
    });
  }

  return {
    panels$: rows$.state$,
    dockedPanels$: docked$.state$,
    floatingPanels$: floating$.state$,
    dismissPanel: machine.dismiss,
    restoreDockedPanel: machine.restore,
    panelData$,
  };
}

/** One desk panel's interpreted data: its source's port streams, folded by
 * the SHARED per-source steps (`@rtc/client-core`'s `panelFrames`), through
 * the spec's transforms and viz. A multi-symbol source publishes once every
 * symbol has a series (`combineLatest`'s rule). Replay-1 and refCounted, as
 * the RxJS `shareReplay({ refCount: true })`. */
function createPanelDataTopic(
  spec: PanelSpecV1,
  deps: PanelStreamDeps,
): Topic<PanelData> {
  return createTopic<PanelData>(
    (signal, publish) => {
      return relaySourceFrames(spec.source, deps, signal, (frame) => {
        publish(renderPanelFrame(spec, frame));
      });
    },
    { replay: true },
  );
}

function relaySourceFrames(
  source: PanelSource,
  deps: PanelStreamDeps,
  signal: AbortSignal,
  next: (frame: Frame) => void,
): Promise<void> {
  switch (source.kind) {
    case "fxTicks": {
      const points: (readonly PanelPoint[])[] = source.symbols.map(() => {
        return [];
      });
      return relayCombined(
        source.symbols.map((symbol, index) => {
          return (emit: (series: NamedSeries) => void) => {
            return relay(
              deps.pricing.getPriceUpdates(symbol),
              signal,
              (tick) => {
                points[index] = appendTickPoint(points[index], tick);
                emit({ label: symbol, points: points[index] });
              },
            );
          };
        }),
        (series) => {
          next(seriesFrame(series));
        },
      );
    }

    case "priceHistory":
      return relayCombined(
        source.symbols.map((symbol) => {
          return (emit: (series: NamedSeries) => void) => {
            return relay(
              deps.pricing.getPriceHistory(symbol),
              signal,
              (ticks) => {
                emit(historySeries(symbol, ticks));
              },
            );
          };
        }),
        (series) => {
          next(seriesFrame(series));
        },
      );

    case "analytics":
      return relay(
        new AnalyticsUseCase(deps.analytics).execute(),
        signal,
        (updates) => {
          next(analyticsTableFrame(updates));
        },
      );

    case "blotter":
      return relay(
        new TradeBlotterUseCase(deps.blotter).execute(),
        signal,
        (trades) => {
          next(blotterTableFrame(trades));
        },
      );

    default:
      next(unknownSourceFrame(source));
      return Promise.resolve();
  }
}

/** `combineLatest` over N relays: publish the latest of each, but only once
 * every one has delivered at least once. */
function relayCombined<T>(
  sources: readonly ((emit: (value: T) => void) => Promise<void>)[],
  next: (values: readonly T[]) => void,
): Promise<void> {
  const latest: T[] = [];
  const seen = new Set<number>();

  return Promise.all(
    sources.map((start, index) => {
      return start((value) => {
        latest[index] = value;
        seen.add(index);

        if (seen.size === sources.length) {
          next([...latest]);
        }
      });
    }),
  ).then(() => {});
}
