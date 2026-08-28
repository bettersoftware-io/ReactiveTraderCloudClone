import type { JSX } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

/** A stripped panel — collapsed, or forced aside by a sibling's maximize —
 * is one clickable restore bar (PROTO's stripBar): a narrow, full-height
 * column reading bottom-to-top when its space reclaims along a row axis, a
 * short full-width bar otherwise. Shared by both layout engines (in-house
 * renders it in place of the panel; dockview portals it into the body slot
 * while the group header is hidden); styled by PanelHead.module.css
 * alongside PanelHeadSlot and PanelHeadControls. */
export function PanelStrip(props: PanelStripProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid={`panel-${props.panelId}-collapse`}
      class={styles.stripBar}
      data-orientation={props.orientation}
      aria-label={`Restore ${props.title}`}
      onClick={() => {
        props.onRestore();
      }}
    >
      <span aria-hidden="true" class={styles.stripGlyph}>
        ⛶
      </span>
      <span class={styles.stripLabel}>{props.title}</span>
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
