import { type JSX, Show } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

/** The header's RIGHT half: the collapse ("—") and maximize (⛶ / ⧉ once
 * maximized) controls, plus the optional pop-out (↗) and close (✕) slots.
 * `maximizable: false` hides only the maximize control — the panel still
 * strips when a sibling maximizes (spec'd on PanelSpec).
 * Shared by both layout engines (the in-house `.panelHeader`, dockview's
 * group actions slot); styled by PanelHead.module.css alongside
 * PanelHeadSlot and PanelStrip. */
export function PanelHeadControls(props: PanelHeadControlsProps): JSX.Element {
  function maximizeLabel(): string {
    return props.maximizedHere
      ? `Restore ${props.title}`
      : `Maximize ${props.title}`;
  }

  // While the panel lives in a pop-out window the geometry intents have no
  // meaning for its group (parked in another document) — every control
  // greys out until the window closes and the panel docks home.
  function popped(): boolean {
    return props.poppedHere === true;
  }

  // While the panel is floating, collapse and maximize have no meaning for
  // its group (a box over the grid, not a grid member) — both controls are
  // HIDDEN outright rather than greyed, unlike the pop-out precedent above.
  function floating(): boolean {
    return props.floatingHere === true;
  }

  function collapsePanel(): void {
    props.onCollapse();
  }

  function maximizeOrRestorePanel(): void {
    props.maximizedHere ? props.onRestore() : props.onMaximize();
  }

  function popoutPanel(): void {
    props.onPopout?.();
  }

  function floatOrDockPanel(): void {
    props.onFloat?.();
  }

  function closePanel(): void {
    props.onClose?.();
  }

  return (
    <div class={styles.panelControls}>
      <Show when={props.onPopout !== undefined}>
        <button
          type="button"
          data-testid={`panel-${props.panelId}-popout`}
          class={styles.panelControl}
          aria-label={`Pop out ${props.title}`}
          title={`Pop out ${props.title}`}
          disabled={popped()}
          aria-disabled={popped()}
          onClick={popoutPanel}
        >
          ↗
        </button>
      </Show>
      <Show when={props.onFloat !== undefined}>
        <button
          type="button"
          data-testid={`panel-${props.panelId}-float`}
          class={styles.panelControl}
          aria-label={
            floating() ? `Dock ${props.title}` : `Float ${props.title}`
          }
          title={floating() ? `Dock ${props.title}` : `Float ${props.title}`}
          disabled={popped()}
          aria-disabled={popped()}
          onClick={floatOrDockPanel}
        >
          {floating() ? "⚓" : "◱"}
        </button>
      </Show>
      <Show when={!floating()}>
        <button
          type="button"
          data-testid={`panel-${props.panelId}-collapse`}
          class={styles.panelControl}
          aria-label={`Collapse ${props.title}`}
          title={`Collapse ${props.title}`}
          disabled={popped()}
          aria-disabled={popped()}
          onClick={collapsePanel}
        >
          —
        </button>
      </Show>
      <Show when={props.maximizable && !floating()}>
        <button
          type="button"
          data-testid={`panel-${props.panelId}-maximize`}
          class={styles.panelControl}
          aria-label={maximizeLabel()}
          title={maximizeLabel()}
          disabled={popped()}
          aria-disabled={popped()}
          onClick={maximizeOrRestorePanel}
        >
          {props.maximizedHere ? "⧉" : "⛶"}
        </button>
      </Show>
      <Show when={props.onClose !== undefined}>
        <button
          type="button"
          data-testid={`panel-${props.panelId}-close`}
          class={styles.panelControl}
          aria-label={`Close ${props.title}`}
          title={`Close ${props.title}`}
          disabled={popped()}
          aria-disabled={popped()}
          onClick={closePanel}
        >
          ✕
        </button>
      </Show>
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
