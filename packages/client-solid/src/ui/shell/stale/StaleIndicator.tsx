import type { JSX } from "@solidjs/web";
import { type ParentProps, Show } from "solid-js";

import styles from "./StaleIndicator.module.css";

/**
 * Wraps children with a greyed-out overlay when data is stale. `data-stale`
 * is spelled out as the string "true": Solid 2 writes a boolean attribute
 * value as presence/absence, so `true` alone would render it empty.
 */
export function StaleIndicator(props: StaleIndicatorProps): JSX.Element {
  return (
    <div
      data-stale={props.stale ? "true" : undefined}
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

interface StaleIndicatorProps extends ParentProps {
  stale: boolean;
  style?: JSX.CSSProperties;
}
