import type { CSSProperties, ReactNode } from "react";

import styles from "./StaleIndicator.module.css";

interface StaleIndicatorProps {
  stale: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * Wraps children with a greyed-out overlay when data is stale.
 */
export function StaleIndicator({
  stale,
  children,
  style,
}: StaleIndicatorProps) {
  return (
    <div
      data-stale={stale || undefined}
      className={styles.wrapper}
      style={style}
    >
      {children}
      {!!stale && (
        <div className={styles.overlay}>
          <span data-testid="stale-message" className={styles.message}>
            Reconnecting...
          </span>
        </div>
      )}
    </div>
  );
}
