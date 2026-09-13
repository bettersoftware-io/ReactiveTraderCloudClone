import type { PanelSpecV1, PanelViz } from "@rtc/shared";

import type { PanelStatus } from "#/machines/jarvisPanels";
import type { PanelData } from "#/presenters/panelStream";
import type { Stream } from "#/stream";

/** The row `JarvisPanelsOverlay` renders per live desk panel. `data$` is the
 * interpreted `composePanelStream` output for a `"live"` panel, or an empty
 * stream for `"unsupported"` — never the raw spec, and never a stream that
 * could emit for an unsupported panel. */
export interface JarvisPanelVm {
  readonly panelId: string;
  readonly title: string;
  readonly rationale: string | null;
  readonly status: PanelStatus;
  readonly vizKind: PanelViz["kind"] | null;
  readonly data$: Stream<PanelData>;
  /** Mirrors `PanelInstance.docked` — see that field's doc. */
  readonly docked: boolean;
}

/**
 * Joins the panels machine's state (panel lifecycle: spawn / edit / evict /
 * dismiss) with the per-panel data interpretation into the `JarvisPanelVm[]`
 * row list the desk-panel overlay renders.
 *
 * Deliberately does NOT re-export the machine's `dockPanel`/`undockPanel`
 * intents. Docking is only half a panels-machine operation: the other half is
 * inserting/removing the matching leaf in the active tab's layout tree and
 * recording which tab the panel belongs to, both of which live in the
 * composition root.
 */
export interface JarvisPanelsPresenter {
  readonly panels$: Stream<readonly JarvisPanelVm[]>;
  /** `panels$`, filtered to the docked subset — what the engine's dynamic
   * registry consumes. */
  readonly dockedPanels$: Stream<readonly JarvisPanelVm[]>;
  /** `panels$`, filtered to the floating (`!docked`) subset — what the
   * overlay layer consumes. */
  readonly floatingPanels$: Stream<readonly JarvisPanelVm[]>;
  /** The RAW dismissal — it drops the panel from the roster and nothing
   * else. A DOCKED panel dismissed this way leaves its leaf behind in the
   * layout tree, so the UI seam is `Presenters.dismissPanel`, which detaches
   * the leaf first. This member stays for the floating-only callers that
   * predate docking. */
  readonly dismissPanel: (panelId: string) => void;
  /** Boot-time rehydration only, and composition-only: it appends a docked
   * panel with no matching layout leaf, which is correct exactly once — when
   * the leaf is already in the tree the persisted payload seeded. */
  readonly restoreDockedPanel: (panelId: string, spec: PanelSpecV1) => void;
  /** Live-resolved data for one desk panel, keyed by `panelId` — the
   * plain-value bridge a UI binding hook reads instead of touching
   * `JarvisPanelVm.data$` directly. `null` while the panel is
   * unknown/unsupported/gone; otherwise the SAME `data$` the `panels$` VM row
   * already exposes for that id. */
  panelData$(panelId: string): Stream<PanelData | null>;
}
