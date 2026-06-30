import type { ReactElement } from "react";

import styles from "#/shell/ambient/AmbientBackground.module.css";

export function AmbientBackground(): ReactElement {
  return (
    <div className={styles.ambient} aria-hidden="true" data-testid="ambient">
      <div className={styles.aurora}>
        <div className={styles.auroraA} />
        <div className={styles.auroraB} />
      </div>
      <div className={styles.sweep} />
      <div className={styles.grid} />
      <div className={styles.particles} />
      <div className={styles.vignette} />
    </div>
  );
}
