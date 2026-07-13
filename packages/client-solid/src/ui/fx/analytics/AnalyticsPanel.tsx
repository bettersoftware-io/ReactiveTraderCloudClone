import type { Accessor, JSX } from "solid-js";
import { Show } from "solid-js";

import type { PositionUpdates } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import { PairPnlBars } from "./PairPnlBars";
import { PnlChart } from "./PnlChart";
import { PnlValue } from "./PnlValue";

import styles from "./AnalyticsPanel.module.css";

export function AnalyticsPanel(): JSX.Element {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();

  return (
    <Show
      when={data()}
      fallback={<div class={styles.loading}>Loading analytics...</div>}
    >
      {(current: Accessor<PositionUpdates>) => {
        return (
          <StaleIndicator stale={stale()}>
            <div data-testid="analytics-panel" class={styles.panel}>
              <div>
                <span class={styles.sectionLabel}>
                  Profit &amp; Loss · Today
                </span>
                <PnlValue value={latestPnl(current())} />
                <PnlChart history={current().history} />
              </div>

              <div>
                <span class={styles.sectionLabel}>PnL per Currency Pair</span>
                <PairPnlBars positions={current().currentPositions} />
              </div>
            </div>
          </StaleIndicator>
        );
      }}
    </Show>
  );
}

function latestPnl(data: PositionUpdates): number {
  return data.history.length > 0
    ? data.history[data.history.length - 1].usdPnl
    : 0;
}
