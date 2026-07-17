import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import { type LatBarVm, latencyBuckets } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./LatencyHistogram.module.css";

/**
 * Latency-distribution histogram — 6 fixed buckets (ported from PROTO
 * Latency/LatencyHistogram.tsx), each bar's height driven by a --bar-h custom
 * property computed by the shared latencyBuckets vm (client-core) from the
 * live latency window; the modal (highest-count) bucket is flagged via
 * data-accent.
 */
export function LatencyHistogram(): JSX.Element {
  const { useMetrics } = useViewModel();
  const { latency } = useMetrics();

  const bars = createMemo((): readonly LatBarVm[] => {
    return latencyBuckets(latency());
  });

  return (
    <div data-testid="admin-latency-histogram" class={styles.card}>
      <div class={styles.head}>
        <span class={styles.title}>LATENCY DISTRIBUTION</span>
        <span class={styles.sub}>ms</span>
      </div>
      <Show
        when={latency().length > 0}
        fallback={<div class={styles.empty}>NO DATA</div>}
      >
        <div class={styles.bars}>
          <For each={bars()}>
            {(bar: LatBarVm) => {
              return (
                <div class={styles.col}>
                  <div
                    class={styles.bar}
                    data-accent={String(bar.accent)}
                    // eslint-disable-next-line no-restricted-syntax -- runtime bar height via CSS custom property; static CSS can't express a per-bucket value
                    style={{ "--bar-h": `${bar.heightPct}%` }}
                  />
                  <span class={styles.tick}>{bar.label}</span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
