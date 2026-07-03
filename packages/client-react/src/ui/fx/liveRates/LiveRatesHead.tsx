import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

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

  return (
    <div className={styles.headTabs}>
      <button
        type="button"
        data-testid="rates-tab-live"
        data-active={ratesTab === "rates" ? "true" : "false"}
        className={styles.headTab}
        onClick={() => {
          setRatesTab("rates");
        }}
      >
        ◧ Live Rates
      </button>
      <button
        type="button"
        data-testid="rates-tab-watchlist"
        data-active={ratesTab === "watchlist" ? "true" : "false"}
        className={styles.headTab}
        onClick={() => {
          setRatesTab("watchlist");
        }}
      >
        ☰ Watchlist
      </button>
      <span className={styles.headSpacer} />
      <button
        type="button"
        data-testid="charts-toggle"
        data-active={charts ? "true" : "false"}
        className={styles.headChip}
        onClick={() => {
          setViewMode(charts ? "price" : "chart");
        }}
      >
        CHARTS
      </button>
    </div>
  );
}
