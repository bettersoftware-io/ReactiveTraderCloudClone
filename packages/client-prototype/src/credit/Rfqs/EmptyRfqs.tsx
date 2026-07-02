import type { ReactElement } from "react";

import styles from "#/credit/Rfqs/EmptyRfqs.module.css";

// PROTO L562: the dashed-border placeholder shown when no RFQs match the
// active filter.
export function EmptyRfqs(): ReactElement {
  return (
    <div className={styles.empty}>
      <div className={styles.glyph}>◇</div>
      <div className={styles.title}>No RFQs to show</div>
      <div className={styles.hint}>Create one with the New RFQ form</div>
    </div>
  );
}
