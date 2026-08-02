import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { JARVIS_BRAIN_LABELS } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./StatusBar.module.css";

/**
 * Footer chip reporting which brain Jarvis is currently running turns with
 * (`ConnectionStatusBar` idiom — a small dumb reflection of one machine
 * field). Renders nothing while Jarvis is unavailable (`state.available`):
 * an offline desk assistant has no brain worth advertising in the footer.
 * The leading `│` separator lives INSIDE this component so a jarvis-less
 * server never leaves a dangling double separator in the footer.
 */
export function JarvisStatusChip(): JSX.Element {
  const { useJarvis } = useViewModel();
  const { state } = useJarvis();

  return (
    <Show when={state().available}>
      <span class={styles.metricSep}>│</span>
      <span
        data-testid="jarvis-status-chip"
        data-brain={state().effectiveBrain}
        class={styles.jarvisChip}
      >
        JARVIS · {JARVIS_BRAIN_LABELS[state().effectiveBrain]}
      </span>
    </Show>
  );
}
