import type { JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { useFxView } from "#/ui/fx/useFxView";
import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/** The fx-rates panel's head slot (PROTO L1191/L1257): Live Rates / Watchlist
 * tabs plus a CHARTS chip that toggles the shared viewMode seam (tiles already
 * receive showChart from LiveRatesPanel). Renders inside the panel header via
 * InhouseLayoutEngine's headRegistry — the collapse/maximize controls stay
 * next to it, owned by the engine, not this component. */
export function LiveRatesHead(): JSX.Element {
  const { ratesTab, setRatesTab } = useFxView();
  const { useViewModePreference } = useViewModel();
  const { viewMode, setViewMode } = useViewModePreference();

  return (
    <div class={styles.headTabs}>
      <button
        type="button"
        data-testid="rates-tab-live"
        data-active={ratesTab() === "rates" ? "true" : "false"}
        class={styles.headTab}
        onClick={() => {
          setRatesTab("rates");
        }}
      >
        ◧ Live Rates
      </button>
      <button
        type="button"
        data-testid="rates-tab-watchlist"
        data-active={ratesTab() === "watchlist" ? "true" : "false"}
        class={styles.headTab}
        onClick={() => {
          setRatesTab("watchlist");
        }}
      >
        ☰ Watchlist
      </button>
      <span class={styles.headSpacer} />
      <button
        type="button"
        data-testid="charts-toggle"
        data-active={viewMode() === "chart" ? "true" : "false"}
        class={styles.headChip}
        onClick={() => {
          setViewMode(viewMode() === "chart" ? "price" : "chart");
        }}
      >
        CHARTS
      </button>
    </div>
  );
}
