import type { JSX } from "solid-js";
import { Show } from "solid-js";

import styles from "./StaleIndicator.module.css";

/**
 * Wraps children with a greyed-out overlay when data is stale.
 */
export function StaleIndicator(props: StaleIndicatorProps): JSX.Element {
  return (
    <div
      data-stale={props.stale || undefined}
      class={styles.wrapper}
      style={props.style}
    >
      {props.children}
      <Show when={props.stale}>
        <div class={styles.overlay}>
          <span data-testid="stale-message" class={styles.message}>
            Reconnecting...
          </span>
        </div>
      </Show>
    </div>
  );
}

interface StaleIndicatorProps {
  stale: boolean;
  children: JSX.Element;
  style?: JSX.CSSProperties;
}
