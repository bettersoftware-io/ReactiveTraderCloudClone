import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

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
