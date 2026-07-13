import type { JSX } from "solid-js";
import { Show } from "solid-js";

import styles from "./PreferencesModal.module.css";

/**
 * Reusable preferences row carrying a label/description and an on/off switch
 * (the `.rtSw` control, prototype Reactive Trader.dc.html:44-47). The switch
 * thumb position + glow are driven entirely by the `data-on` attribute in CSS,
 * so the control is a dumb reflection of the `on` prop.
 */
export function PrefToggle(props: PrefToggleProps): JSX.Element {
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
        role="switch"
        aria-checked={props.on}
        aria-label={props.label}
        data-testid={props.testid}
        data-on={props.on ? "true" : "false"}
        class={styles.sw}
        onClick={() => {
          props.onToggle();
        }}
      />
    </div>
  );
}

interface PrefToggleProps {
  /** Row label (the setting name). */
  label: string;
  /** Optional secondary description line. */
  description?: string;
  /** Current on/off state (reflected on the switch via `data-on`). */
  on: boolean;
  /** Fired when the switch is clicked. */
  onToggle: () => void;
  /** Stable testid for the switch element (e.g. "pref-toggle-animatedBg"). */
  testid: string;
}
