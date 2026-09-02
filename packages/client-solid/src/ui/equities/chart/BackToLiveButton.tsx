import type { JSX } from "solid-js";

import styles from "./BackToLiveButton.module.css";

/**
 * The plot's "jump back to the live edge" pill — shown only while the
 * viewport has been panned/zoomed away from the newest candle
 * (`!atLiveEdge`, checked by the caller).
 */
export function BackToLiveButton(props: BackToLiveButtonProps): JSX.Element {
  function jumpToLive(): void {
    props.onClick();
  }

  return (
    <button
      type="button"
      class={styles.button}
      data-testid="chart-back-to-live"
      onClick={jumpToLive}
    >
      BACK TO LIVE
    </button>
  );
}

export interface BackToLiveButtonProps {
  readonly onClick: () => void;
}
