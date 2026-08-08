import type { JSX } from "solid-js";
import { Show } from "solid-js";

import type { JarvisState } from "@rtc/client-core";
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
 *
 * While a usage-budget gate is active (`state().gate`), the chip also
 * carries `data-gate` and a visible text suffix — `· budget-limited` for a
 * soft gate (some brains removed), `· budget exhausted` for a hard gate
 * (every live brain removed, forced to scripted) — so the same fact the
 * Preferences picker's hint/tooltip explains is visible without opening the
 * modal. A static color tint only (amber soft / red hard, reusing the
 * status bar's existing warn/error tokens) — no transition/animation, per
 * `docs/performance.md`.
 */
export function JarvisStatusChip(): JSX.Element {
  const { useJarvis } = useViewModel();
  const { state } = useJarvis();

  function gate(): JarvisState["gate"] {
    return state().gate;
  }

  function chipClass(): string {
    return gate() === null
      ? styles.jarvisChip
      : `${styles.jarvisChip} ${styles.jarvisChipGated}`;
  }

  return (
    <Show when={state().available}>
      <span class={styles.metricSep}>│</span>
      <span
        data-testid="jarvis-status-chip"
        data-brain={state().effectiveBrain}
        data-gate={gate() === null ? undefined : gate()?.level}
        class={chipClass()}
      >
        JARVIS · {JARVIS_BRAIN_LABELS[state().effectiveBrain]}
        <Show when={gate() !== null}>
          {gate()?.level === "soft"
            ? " · budget-limited"
            : " · budget exhausted"}
        </Show>
      </span>
    </Show>
  );
}
