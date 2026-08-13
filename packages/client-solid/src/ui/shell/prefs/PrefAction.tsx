import type { JSX } from "solid-js";
import { Show } from "solid-js";

import styles from "./PreferencesContent.module.css";

/**
 * Reusable preferences row for an ACTION rather than a stored value — a
 * bordered button that fires `onPress` immediately, with no on/off or
 * segment state of its own to reflect back (unlike `PrefToggle`/
 * `PrefSegment`, which both mirror a live preference via `data-on`). First
 * use: "Reset workspace layout" (DATA & PRIVACY).
 */
export function PrefAction(props: PrefActionProps): JSX.Element {
  return (
    <div class={styles.row}>
      <div class={styles.rowText}>
        <div class={styles.rowLabel}>{props.label}</div>
        <Show when={props.description}>
          <div class={styles.rowDesc}>{props.description}</div>
        </Show>
      </div>
      <button
        type="button"
        data-testid={props.testid}
        class={styles.actionButton}
        onClick={() => {
          props.onPress();
        }}
      >
        {props.buttonLabel}
      </button>
    </div>
  );
}

interface PrefActionProps {
  /** Row label (the setting name). */
  label: string;
  /** Optional secondary description line. */
  description?: string;
  /** The button's visible copy (e.g. "RESET"). */
  buttonLabel: string;
  /** Stable testid for the button element. */
  testid: string;
  /** Fired when the button is clicked — a slot: this row doesn't know (or
   * care) what the action does. */
  onPress: () => void;
}
