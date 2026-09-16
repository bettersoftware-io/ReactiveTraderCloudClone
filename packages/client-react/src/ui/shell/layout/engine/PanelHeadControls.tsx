import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

/** The header's RIGHT half: the collapse ("—") and maximize (⛶ / ⧉ once
 * maximized) controls, plus the optional pop-out (↗) and close (✕) slots.
 * `maximizable: false` hides only the maximize control — the panel still
 * strips when a sibling maximizes (spec'd on PanelSpec). */
export function PanelHeadControls({
  panelId,
  title,
  maximizable,
  maximizedHere,
  poppedHere,
  floatingHere,
  onCollapse,
  onMaximize,
  onRestore,
  onPopout,
  onFloat,
  onClose,
}: PanelHeadControlsProps): ReactElement {
  // While the panel lives in a pop-out window the geometry intents have no
  // meaning for its group (parked in another document) — every control
  // greys out until the window closes and the panel docks home.
  const popped = poppedHere === true;
  // While the panel is floating, collapse and maximize have no meaning for
  // its group (a box over the grid, not a grid member) — both controls are
  // HIDDEN outright rather than greyed, unlike the pop-out precedent above.
  const floating = floatingHere === true;
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
      {onFloat !== undefined ? (
        <button
          type="button"
          data-testid={`panel-${panelId}-float`}
          className={styles.panelControl}
          aria-label={floating ? `Dock ${title}` : `Float ${title}`}
          title={floating ? `Dock ${title}` : `Float ${title}`}
          disabled={popped}
          aria-disabled={popped}
          onClick={onFloat}
        >
          {floating ? "⚓" : "◱"}
        </button>
      ) : null}
      {floating ? null : (
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
      )}
      {maximizable && !floating ? (
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
      {onClose !== undefined ? (
        <button
          type="button"
          data-testid={`panel-${panelId}-close`}
          className={styles.panelControl}
          aria-label={`Close ${title}`}
          title={`Close ${title}`}
          disabled={popped}
          aria-disabled={popped}
          onClick={onClose}
        >
          ✕
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
  /** True while this panel's group is floating over the grid: collapse and
   * maximize are HIDDEN outright (not merely greyed, unlike `poppedHere`) —
   * a floating box is not a grid member, so those geometry intents have no
   * target. */
  floatingHere?: boolean;
  // Slots (property syntax): the header never knows what an engine attaches
  // — see docs/handler-naming.md's slot-vs-handler doctrine.
  onCollapse: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  /** Pops the panel out into its own browser window. Optional slot — only
   * the dockview bridge attaches it (the `mountActions` engine-gating
   * idiom): in-house and RN heads render no pop-out control, zero fan-out. */
  onPopout?: () => void;
  /** Floats the panel's group as a box over the grid, or returns it home once
   * already floating — same optional-slot idiom as `onPopout`, attached only
   * by the dockview bridge. */
  onFloat?: () => void;
  /** Closes the panel outright. Optional slot — only the dockview bridge
   * attaches it, and only for a dynamically opened chart instance (a static
   * panel closes through the View menu instead); absent, the head renders no
   * close control and its markup is unchanged. */
  onClose?: () => void;
}
