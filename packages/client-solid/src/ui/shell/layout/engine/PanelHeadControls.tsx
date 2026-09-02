import { type JSX, Show } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

/** The header's RIGHT half: the collapse ("—") and maximize (⛶ / ⧉ once
 * maximized) controls. `maximizable: false` hides only the maximize control
 * — the panel still strips when a sibling maximizes (spec'd on PanelSpec).
 * Shared by both layout engines (the in-house `.panelHeader`, dockview's
 * group actions slot); styled by PanelHead.module.css alongside
 * PanelHeadSlot and PanelStrip. */
export function PanelHeadControls(props: PanelHeadControlsProps): JSX.Element {
  function maximizeLabel(): string {
    return props.maximizedHere
      ? `Restore ${props.title}`
      : `Maximize ${props.title}`;
  }

  function collapsePanel(): void {
    props.onCollapse();
  }

  function maximizeOrRestorePanel(): void {
    props.maximizedHere ? props.onRestore() : props.onMaximize();
  }

  return (
    <div class={styles.panelControls}>
      <button
        type="button"
        data-testid={`panel-${props.panelId}-collapse`}
        class={styles.panelControl}
        aria-label={`Collapse ${props.title}`}
        title={`Collapse ${props.title}`}
        onClick={collapsePanel}
      >
        —
      </button>
      <Show when={props.maximizable}>
        <button
          type="button"
          data-testid={`panel-${props.panelId}-maximize`}
          class={styles.panelControl}
          aria-label={maximizeLabel()}
          title={maximizeLabel()}
          onClick={maximizeOrRestorePanel}
        >
          {props.maximizedHere ? "⧉" : "⛶"}
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
  // Slots (property syntax): the header never knows what an engine attaches
  // — see docs/handler-naming.md's slot-vs-handler doctrine.
  onCollapse: () => void;
  onMaximize: () => void;
  onRestore: () => void;
}
