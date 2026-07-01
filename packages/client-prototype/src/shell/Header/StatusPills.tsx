import type { ReactElement } from "react";

import styles from "#/shell/Header/StatusPills.module.css";

export function StatusPills(): ReactElement {
  return (
    <div className={styles.pills}>
      <div className={styles.liveGroup}>
        <div className={styles.dot} />
        <span className={styles.liveLabel}>LIVE</span>
      </div>
      <span className={styles.prodBadge}>PROD</span>
    </div>
  );
}
