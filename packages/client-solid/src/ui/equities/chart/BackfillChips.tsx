import { type JSX, Show } from "solid-js";

import styles from "./BackfillChips.module.css";

/**
 * The plot's backfill status chips, pinned to the LEFT edge: a passive
 * "LOADING OLDER…" while a history page is in flight, and the terminal
 * "START OF HISTORY" once exhaustion is reached AND the viewport sits hard
 * against index 0 (the caller computes both flags — this is a pure leaf).
 * At most one renders at a time: loading wins (a fetch can only be in
 * flight while NOT exhausted, but belt-and-braces here).
 */
export function BackfillChips(props: BackfillChipsProps): JSX.Element {
  return (
    <Show
      when={props.loadingOlder}
      fallback={
        <Show when={props.historyStart}>
          <div class={styles.chip} data-testid="chart-history-start">
            START OF HISTORY
          </div>
        </Show>
      }
    >
      <div class={styles.chip} data-testid="chart-loading-older">
        LOADING OLDER…
      </div>
    </Show>
  );
}

export interface BackfillChipsProps {
  readonly loadingOlder: boolean;
  readonly historyStart: boolean;
}
