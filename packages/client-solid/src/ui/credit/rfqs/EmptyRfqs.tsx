import type { JSX } from "solid-js";

import styles from "./EmptyRfqs.module.css";

/** PROTO Rfqs/EmptyRfqs.tsx: the dashed-border placeholder shown when no RFQs
 * match the active filter. */
export function EmptyRfqs(): JSX.Element {
  return (
    <div class={styles.empty}>
      <div class={styles.glyph}>◇</div>
      <div class={styles.title}>No RFQs to show</div>
      <div class={styles.hint}>Create one with the New RFQ form</div>
    </div>
  );
}
