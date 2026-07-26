import type { JSX } from "solid-js";

import styles from "./BackToLiveButton.module.css";

/**
 * The plot's "jump back to the live edge" pill — shown only while the
 * viewport has been panned/zoomed away from the newest candle
 * (`!atLiveEdge`, checked by the caller).
 */
export function BackToLiveButton(props: BackToLiveButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={styles.button}
      data-testid="chart-back-to-live"
      // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
      onClick={props.onClick}
    >
      BACK TO LIVE
    </button>
  );
}

export interface BackToLiveButtonProps {
  readonly onClick: () => void;
}
