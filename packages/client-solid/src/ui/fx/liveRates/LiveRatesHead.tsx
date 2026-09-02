import type { JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import type { RatesTab } from "#/ui/fx/fxViewContext";
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

  function selectRatesTab(tab: RatesTab) {
    return () => {
      setRatesTab(tab);
    };
  }

  function toggleChartsView(): void {
    setViewMode(viewMode() === "chart" ? "price" : "chart");
  }

  return (
    <div class={styles.headTabs}>
      <button
        type="button"
        data-testid="rates-tab-live"
        data-active={ratesTab() === "rates" ? "true" : "false"}
        class={styles.headTab}
        onClick={selectRatesTab("rates")}
      >
        ◧ Live Rates
      </button>
      <button
        type="button"
        data-testid="rates-tab-watchlist"
        data-active={ratesTab() === "watchlist" ? "true" : "false"}
        class={styles.headTab}
        onClick={selectRatesTab("watchlist")}
      >
        ☰ Watchlist
      </button>
      <span class={styles.headSpacer} />
      <button
        type="button"
        data-testid="charts-toggle"
        data-active={viewMode() === "chart" ? "true" : "false"}
        class={styles.headChip}
        onClick={toggleChartsView}
      >
        CHARTS
      </button>
    </div>
  );
}
