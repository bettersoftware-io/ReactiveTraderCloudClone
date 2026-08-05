import { EMPTY, type Observable, of, type Subscription } from "rxjs";
import { map, shareReplay, switchMap } from "rxjs/operators";

import type { PanelSpecV1, PanelViz } from "@rtc/shared";

import {
  composePanelStream,
  type PanelData,
  type PanelStreamDeps,
} from "./composePanelStream.js";
import type {
  JarvisPanelsMachineHandle,
  PanelInstance,
  PanelStatus,
} from "./JarvisPanelsMachine.js";

/** The row `JarvisPanelsOverlay` (a later task) renders per live desk panel.
 * `data$` is the interpreted `composePanelStream` output for a `"live"`
 * panel, or `EMPTY` for `"unsupported"` — never the raw spec, and never a
 * stream that could emit for an unsupported panel. */
export interface JarvisPanelVm {
  readonly panelId: string;
  readonly title: string;
  readonly rationale: string | null;
  readonly status: PanelStatus;
  readonly vizKind: PanelViz["kind"] | null;
  readonly data$: Observable<PanelData>;
}

/** Title shown for a panel the render adapter (Task 4) substituted with
 * `UNSUPPORTED_SENTINEL_SPEC` — the VM never touches that sentinel's own
 * `.title` directly (see `JarvisPanelsMachine`'s doc on why `spec` is
 * nulled for `"unsupported"` instances), so this is its own small constant. */
const UNSUPPORTED_TITLE = "Unsupported panel";

/** One `composePanelStream(spec, deps)` result kept warm per live panelId,
 * so N `JarvisPanelVm.data$` readers (and the presenter's own keep-warm
 * subscription below) share exactly one port subscription — and so that
 * subscription is provably torn down when the panel goes away, rather than
 * relying on every UI reader happening to unmount. */
interface PanelCacheEntry {
  readonly spec: PanelSpecV1;
  readonly data$: Observable<PanelData>;
  readonly warm: Subscription;
}

function buildPanelVm(
  panel: PanelInstance,
  cache: Map<string, PanelCacheEntry>,
): JarvisPanelVm {
  if (panel.status === "unsupported" || !panel.spec) {
    return {
      panelId: panel.panelId,
      title: UNSUPPORTED_TITLE,
      rationale: null,
      status: "unsupported",
      vizKind: null,
      data$: EMPTY,
    };
  }

  const spec = panel.spec;
  return {
    panelId: panel.panelId,
    title: spec.title,
    rationale: spec.rationale ?? null,
    status: "live",
    vizKind: spec.viz.kind,
    data$: cache.get(panel.panelId)?.data$ ?? EMPTY,
  };
}

/**
 * Joins `JarvisPanelsMachine`'s state (panel lifecycle: spawn / edit / evict
 * / dismiss) with `composePanelStream` (per-panel data interpretation) into
 * the `JarvisPanelVm[]` row list the desk-panel overlay renders.
 *
 * Session-lifetime singleton, constructed once at composition (mirrors
 * `JarvisPanelsMachine`'s own doc) — NOT per overlay mount.
 *
 * Ownership of each live panel's port subscription: this presenter keeps ONE
 * warm subscription per live `panelId` (a plain `.subscribe()` on
 * `composePanelStream`'s already-shareReplayed stream, held in `cache`),
 * independent of whatever the UI is currently rendering. A panel's cache
 * entry — and that warm subscription — is torn down the moment its
 * `panelId` stops being `"live"` in machine state (dismissed via
 * `dismissPanel`, or FIFO-evicted at `MAX_LIVE_PANELS`): with
 * `composePanelStream`'s `shareReplay({ refCount: true })`, releasing this
 * one warm hold drops the shared subscriber count to zero (assuming no UI
 * reader is *also* independently subscribed at that instant — the overlay
 * unmounts alongside dismissal), which cascades all the way down to
 * unsubscribing the underlying domain-port streams (the ws-effects #171
 * lesson: a live subscription must actually go away, not just go unused).
 * On a spec *edit* (same `panelId`, new `viz`/transform via a restylePanel
 * turn) the stale entry is torn down and replaced the same way, so a
 * restyled panel never keeps its old interpretation running underneath the
 * new one.
 */
export class JarvisPanelsPresenter {
  private readonly cache = new Map<string, PanelCacheEntry>();

  /** One multiplexed `panelData$(panelId)` result kept per distinct id ever
   * asked for — mirrors `DepthPresenter.depth$`'s Map-cached `shareReplay`
   * idiom (a repeat call returns the SAME Observable, one shared
   * subscription for however many UI readers). Unlike `DepthPresenter`'s
   * key (a currency symbol, whose underlying port stream identity never
   * changes), a `panelId` CAN be dismissed and later reused by a brand-new
   * `PanelInstance` — so the cached stream itself stays a `switchMap` over
   * `panels$` rather than a frozen reference to one `PanelCacheEntry.data$`,
   * so a respawn under the same id is picked up on the next `panels$`
   * emission rather than replaying the old (torn-down) panel's last frame. */
  private readonly panelDataCache = new Map<
    string,
    Observable<PanelData | null>
  >();

  readonly panels$: Observable<readonly JarvisPanelVm[]>;

  readonly dismissPanel: (panelId: string) => void;

  constructor(machine: JarvisPanelsMachineHandle, deps: PanelStreamDeps) {
    this.dismissPanel = machine.dismissPanel;

    this.panels$ = machine.state$.pipe(
      map((s) => {
        return s.panels.map((panel) => {
          return buildPanelVm(panel, this.cache);
        });
      }),
    );

    // Own warm subscription — kept alive for the whole presenter lifetime,
    // independent of panels$'s own subscriber count, so a live panel's port
    // streams flow (and get released on dismiss/eviction/edit) whether or
    // not any UI component is currently mounted to read them. See the class
    // doc above for the full teardown contract.
    machine.state$.subscribe((s) => {
      this.syncCache(s.panels, deps);
    });
  }

  /** Live-resolved data for one desk panel, keyed by `panelId` — the
   * plain-value bridge a UI binding hook (`useJarvisPanelData` in both
   * react-bindings and solid-bindings) reads instead of touching
   * `JarvisPanelVm.data$` (a raw `Observable`) directly. `null` while the
   * panel is unknown/unsupported/gone; otherwise the SAME `data$` this
   * class's `panels$` VM row already exposes for that id — reusing the
   * existing per-panel stream cache above rather than standing up a second
   * one. See the class-level `panelDataCache` doc for why this is a
   * `switchMap` over `panels$`, not a frozen snapshot. */
  panelData$(panelId: string): Observable<PanelData | null> {
    const cached = this.panelDataCache.get(panelId);

    if (cached) {
      return cached;
    }

    const stream = this.panels$.pipe(
      switchMap((panels) => {
        const panel = panels.find((p) => {
          return p.panelId === panelId;
        });
        return panel && panel.status === "live" ? panel.data$ : of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.panelDataCache.set(panelId, stream);
    return stream;
  }

  private syncCache(
    panels: readonly PanelInstance[],
    deps: PanelStreamDeps,
  ): void {
    const liveIds = new Set(
      panels
        .filter((p) => {
          return p.status === "live";
        })
        .map((p) => {
          return p.panelId;
        }),
    );

    for (const [panelId, entry] of this.cache) {
      if (!liveIds.has(panelId)) {
        entry.warm.unsubscribe();
        this.cache.delete(panelId);
      }
    }

    for (const panel of panels) {
      if (panel.status !== "live" || !panel.spec) {
        continue;
      }

      const existing = this.cache.get(panel.panelId);

      if (existing && existing.spec === panel.spec) {
        continue;
      }

      existing?.warm.unsubscribe();

      const data$ = composePanelStream(panel.spec, deps);
      const warm = data$.subscribe();
      this.cache.set(panel.panelId, { spec: panel.spec, data$, warm });
    }
  }
}
