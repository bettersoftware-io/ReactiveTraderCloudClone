import type { JSX } from "solid-js";
import { For } from "solid-js";

import styles from "./PreferencesModal.module.css";

/**
 * Reusable preferences row carrying a label and a segmented button group (the
 * `.rtSeg` controls, prototype Reactive Trader.dc.html:48-50). The active
 * segment is driven by the `data-on` attribute in CSS, so the control is a dumb
 * reflection of the `value` prop.
 */
export function PrefSegment(props: PrefSegmentProps): JSX.Element {
  return (
    <div class={styles.row}>
      <div class={styles.rowText}>
        <div class={styles.rowLabel}>{props.label}</div>
      </div>
      <div class={styles.seg}>
        <For each={props.options}>
          {(option: PrefSegmentOption) => {
            function active(): boolean {
              return option.value === props.value;
            }

            return (
              <button
                type="button"
                aria-pressed={active()}
                data-testid={`${props.testid}-${option.value}`}
                data-on={active() ? "true" : "false"}
                class={styles.segButton}
                onClick={() => {
                  props.onChange(option.value);
                }}
              >
                {option.label}
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}

export interface PrefSegmentOption {
  /** Stable value identifying the option. */
  value: string;
  /** Visible label. */
  label: string;
}

interface PrefSegmentProps {
  /** Row label (the setting name). */
  label: string;
  /** The selectable options, in render order. */
  options: readonly PrefSegmentOption[];
  /** The currently-selected option value (reflected via `data-on`). */
  value: string;
  /** Fired with the chosen value when a segment is clicked. */
  onChange: (value: string) => void;
  /** Stable testid prefix; each button gets `${testid}-${option.value}`. */
  testid: string;
}
