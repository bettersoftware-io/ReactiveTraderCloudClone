import type { Accessor, JSX } from "solid-js";
import { For, Show } from "solid-js";

import {
  type CurrencyExposure,
  netExposureByCurrency,
  type PositionUpdates,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import styles from "./PositionsPanel.module.css";

export function PositionsPanel(): JSX.Element {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();

  return (
    <Show
      when={data()}
      fallback={<div class={styles.loading}>Loading positions...</div>}
    >
      {(current: Accessor<PositionUpdates>) => {
        function exposures(): readonly CurrencyExposure[] {
          return netExposureByCurrency(current().currentPositions);
        }

        return (
          <StaleIndicator stale={stale()}>
            <div data-testid="positions-panel" class={styles.panel}>
              <span class={styles.sectionLabel}>Net Exposure</span>
              <div class={styles.cluster}>
                <For each={exposures()}>
                  {(e: CurrencyExposure) => {
                    const size = bubbleSize(e.amountMillions);
                    return (
                      <span
                        data-testid={`exposure-bubble-${e.currency}`}
                        data-sign={e.amountMillions >= 0 ? "pos" : "neg"}
                        class={styles.bubble}
                        style={
                          // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
                          {
                            "--bubble-size": `${size}px`,
                            "--bubble-label-size": size > 62 ? "15px" : "12px",
                          }
                        }
                      >
                        <span class={styles.bubbleRing} aria-hidden="true" />
                        <span class={styles.bubbleCcy}>{e.currency}</span>
                        <span class={styles.bubbleAmt}>
                          {formatMillions(e.amountMillions)}
                        </span>
                      </span>
                    );
                  }}
                </For>
              </div>
              <div class={styles.ladder}>
                <For each={exposures()}>
                  {(e: CurrencyExposure) => {
                    return (
                      <div
                        data-testid={`exposure-row-${e.currency}`}
                        class={styles.ladderRow}
                      >
                        <span class={styles.ladderCcy}>{e.currency}</span>
                        <span
                          data-sign={e.amountMillions >= 0 ? "pos" : "neg"}
                          class={styles.ladderAmt}
                        >
                          {formatMillions(e.amountMillions)}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </StaleIndicator>
        );
      }}
    </Show>
  );
}

/** PROTO bubble diameter (dc.html L1301): 40 + sqrt(|millions|) * 11. */
function bubbleSize(amountMillions: number): number {
  return Math.round(40 + Math.sqrt(Math.abs(amountMillions)) * 11);
}

function formatMillions(amountMillions: number): string {
  return `${amountMillions > 0 ? "+" : ""}${amountMillions.toFixed(1)}M`;
}
