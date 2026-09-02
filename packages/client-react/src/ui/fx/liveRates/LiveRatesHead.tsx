import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import type { RatesTab } from "#/ui/fx/fxViewContext";
import { useFxView } from "#/ui/fx/useFxView";
import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/** The fx-rates panel's head slot (PROTO L1191/L1257): Live Rates / Watchlist
 * tabs plus a CHARTS chip that toggles the shared viewMode seam (tiles already
 * receive showChart from LiveRatesPanel). Renders inside the panel header via
 * InhouseLayoutEngine's headRegistry — the collapse/maximize controls stay
 * next to it, owned by the engine, not this component. */
export function LiveRatesHead(): ReactElement {
  const { ratesTab, setRatesTab } = useFxView();
  const { useViewModePreference } = useViewModel();
  const { viewMode, setViewMode } = useViewModePreference();
  const charts = viewMode === "chart";

  function selectRatesTab(tab: RatesTab) {
    return () => {
      setRatesTab(tab);
    };
  }

  function toggleChartsView(): void {
    setViewMode(charts ? "price" : "chart");
  }

  return (
    <div className={styles.headTabs}>
      <button
        type="button"
        data-testid="rates-tab-live"
        data-active={ratesTab === "rates" ? "true" : "false"}
        className={styles.headTab}
        onClick={selectRatesTab("rates")}
      >
        ◧ Live Rates
      </button>
      <button
        type="button"
        data-testid="rates-tab-watchlist"
        data-active={ratesTab === "watchlist" ? "true" : "false"}
        className={styles.headTab}
        onClick={selectRatesTab("watchlist")}
      >
        ☰ Watchlist
      </button>
      <span className={styles.headSpacer} />
      <button
        type="button"
        data-testid="charts-toggle"
        data-active={charts ? "true" : "false"}
        className={styles.headChip}
        onClick={toggleChartsView}
      >
        CHARTS
      </button>
    </div>
  );
}
