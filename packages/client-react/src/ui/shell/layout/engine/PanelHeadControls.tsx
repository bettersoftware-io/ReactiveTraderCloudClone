import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

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
