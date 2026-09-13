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
  poppedHere,
  onCollapse,
  onMaximize,
  onRestore,
  onPopout,
}: PanelHeadControlsProps): ReactElement {
  // While the panel lives in a pop-out window the geometry intents have no
  // meaning for its group (parked in another document) — every control
  // greys out until the window closes and the panel docks home.
  const popped = poppedHere === true;
  return (
    <div className={styles.panelControls}>
      {onPopout !== undefined ? (
        <button
          type="button"
          data-testid={`panel-${panelId}-popout`}
          className={styles.panelControl}
          aria-label={`Pop out ${title}`}
          title={`Pop out ${title}`}
          disabled={popped}
          aria-disabled={popped}
          onClick={onPopout}
        >
          ↗
        </button>
      ) : null}
      <button
        type="button"
        data-testid={`panel-${panelId}-collapse`}
        className={styles.panelControl}
        aria-label={`Collapse ${title}`}
        title={`Collapse ${title}`}
        disabled={popped}
        aria-disabled={popped}
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
          disabled={popped}
          aria-disabled={popped}
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
  /** True while this panel lives in a pop-out window: collapse, maximize and
   * the pop-out control itself grey out — the geometry intents have no
   * meaning for a group parked in another document. */
  poppedHere?: boolean;
  // Slots (property syntax): the header never knows what an engine attaches
  // — see docs/handler-naming.md's slot-vs-handler doctrine.
  onCollapse: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  /** Pops the panel out into its own browser window. Optional slot — only
   * the dockview bridge attaches it (the `mountActions` engine-gating
   * idiom): in-house and RN heads render no pop-out control, zero fan-out. */
  onPopout?: () => void;
}
