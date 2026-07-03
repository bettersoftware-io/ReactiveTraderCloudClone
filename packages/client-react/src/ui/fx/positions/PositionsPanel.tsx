import type { ReactElement } from "react";

import styles from "./PositionsPanel.module.css";

/** Skeleton panel for the fx-positions layout slot (Task 8). Task 9 fills the
 * body with the real net-exposure view; this establishes the panel shape +
 * registry wiring so the fixed 360px rail renders something concrete. */
export function PositionsPanel(): ReactElement {
  return (
    <div data-testid="positions-panel" className={styles.panel}>
      <span className={styles.sectionLabel}>Net Exposure</span>
    </div>
  );
}
