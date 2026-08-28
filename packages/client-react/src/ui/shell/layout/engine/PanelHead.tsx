import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

/** The header's LEFT half: the panel's registered head slot (FX's Live
 * Rates ▸ Watchlist tabs + CHARTS chip) or, absent one, its title rendered
 * as a single accent tab. Shared by both layout engines — the in-house
 * engine renders it inside its `.panelHeader`; the dockview engine portals
 * it into dockview's tab (its drag surface) — so a panel's header is the
 * same nodes whichever engine is on. */
export function PanelHeadSlot({
  panelId,
  title,
  headContent,
}: PanelHeadSlotProps): ReactElement {
  if (headContent) {
    return <div className={styles.panelHeadContent}>{headContent()}</div>;
  }

  return (
    <span
      data-testid={`panel-${panelId}-title`}
      className={styles.panelTitle}
    >
      {title}
    </span>
  );
}

export interface PanelHeadSlotProps {
  panelId: PanelId;
  title: string;
  /** The panel's entry in the head registry, when it has one. */
  headContent?: () => ReactElement;
}

/** The header's RIGHT half: the collapse ("—") and maximize (⛶ / ⧉ once
 * maximized) controls. `maximizable: false` hides only the maximize control
 * — the panel still strips when a sibling maximizes (spec'd on PanelSpec). */
export function PanelHeadControls({
  panelId,
  title,
  maximizable,
  maximizedHere,
  onCollapse,
  onMaximize,
  onRestore,
}: PanelHeadControlsProps): ReactElement {
  return (
    <div className={styles.panelControls}>
      <button
        type="button"
        data-testid={`panel-${panelId}-collapse`}
        className={styles.panelControl}
        aria-label={`Collapse ${title}`}
        title={`Collapse ${title}`}
        onClick={onCollapse}
      >
        —
      </button>
      {maximizable ? (
        <button
          type="button"
          data-testid={`panel-${panelId}-maximize`}
          className={styles.panelControl}
          aria-label={maximizedHere ? `Restore ${title}` : `Maximize ${title}`}
          title={maximizedHere ? `Restore ${title}` : `Maximize ${title}`}
          onClick={maximizedHere ? onRestore : onMaximize}
        >
          {maximizedHere ? "⧉" : "⛶"}
        </button>
      ) : null}
    </div>
  );
}

export interface PanelHeadControlsProps {
  panelId: PanelId;
  title: string;
  maximizable: boolean;
  maximizedHere: boolean;
  // Slots (property syntax): the header never knows what an engine attaches
  // — see docs/handler-naming.md's slot-vs-handler doctrine.
  onCollapse: () => void;
  onMaximize: () => void;
  onRestore: () => void;
}

/** A stripped panel — collapsed, or forced aside by a sibling's maximize —
 * is one clickable restore bar (PROTO's stripBar): a narrow, full-height
 * column reading bottom-to-top when its space reclaims along a row axis, a
 * short full-width bar otherwise. */
export function PanelStrip({
  panelId,
  title,
  orientation,
  onRestore,
}: PanelStripProps): ReactElement {
  return (
    <button
      type="button"
      data-testid={`panel-${panelId}-collapse`}
      className={styles.stripBar}
      data-orientation={orientation}
      aria-label={`Restore ${title}`}
      onClick={onRestore}
    >
      <span aria-hidden="true" className={styles.stripGlyph}>
        ⛶
      </span>
      <span className={styles.stripLabel}>{title}</span>
    </button>
  );
}

export type StripOrientation = "vertical" | "horizontal";

export interface PanelStripProps {
  panelId: PanelId;
  title: string;
  orientation: StripOrientation;
  onRestore: () => void;
}
