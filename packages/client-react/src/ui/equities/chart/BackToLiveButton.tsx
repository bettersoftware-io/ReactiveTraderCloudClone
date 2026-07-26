import type { ReactElement } from "react";

import styles from "./BackToLiveButton.module.css";

/**
 * The plot's "jump back to the live edge" pill — shown only while the
 * viewport has been panned/zoomed away from the newest candle
 * (`!atLiveEdge`, checked by the caller).
 */
export function BackToLiveButton({
  onClick,
}: BackToLiveButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.button}
      data-testid="chart-back-to-live"
      onClick={onClick}
    >
      BACK TO LIVE
    </button>
  );
}

export interface BackToLiveButtonProps {
  readonly onClick: () => void;
}
