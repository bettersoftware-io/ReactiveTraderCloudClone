import type { ReactElement } from "react";

import { JARVIS_BRAIN_LABELS } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./StatusBar.module.css";

/**
 * Footer chip reporting which brain Jarvis is currently running turns with
 * (`ConnectionStatusBar` idiom — a small dumb reflection of one machine
 * field). Renders nothing while Jarvis is unavailable (`state.available`):
 * an offline desk assistant has no brain worth advertising in the footer.
 */
export function JarvisStatusChip(): ReactElement | null {
  const { useJarvis } = useViewModel();
  const { state } = useJarvis();

  if (!state.available) {
    return null;
  }

  return (
    <span
      data-testid="jarvis-status-chip"
      data-brain={state.effectiveBrain}
      className={styles.jarvisChip}
    >
      JARVIS · {JARVIS_BRAIN_LABELS[state.effectiveBrain]}
    </span>
  );
}
