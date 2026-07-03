import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { useFxView } from "#/ui/fx/useFxView";
import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

import { QuickFilter } from "./QuickFilter";

/** The fx-blotter panel's head slot (PROTO L471/L478): FX Blotter / Activity
 * tabs, plus — only while the Trades tab is showing — the live trade count,
 * the quick-filter input, and the CSV export chip. Mirrors LiveRatesHead
 * (Task 11): renders inside the panel header via InhouseLayoutEngine's
 * headRegistry, reads/writes the shared FxViewContext seam, and reads the
 * trade count straight off the ViewModel (FxBlotter owns the export handler
 * handoff via setExportCsvHandler, registered in its own effect). */
export function FxBlotterHead(): ReactElement {
  const { blotterTab, setBlotterTab, quickFilter, setQuickFilter, exportCsv } =
    useFxView();
  const { useTrades } = useViewModel();
  const trades = useTrades();

  return (
    <div className={styles.headTabs}>
      <button
        type="button"
        data-testid="blotter-tab-trades"
        data-active={blotterTab === "trades" ? "true" : "false"}
        className={styles.headTab}
        onClick={() => {
          setBlotterTab("trades");
        }}
      >
        ▤ FX Blotter
      </button>
      <button
        type="button"
        data-testid="blotter-tab-activity"
        data-active={blotterTab === "activity" ? "true" : "false"}
        className={styles.headTab}
        onClick={() => {
          setBlotterTab("activity");
        }}
      >
        ⚡ Activity
      </button>
      <span className={styles.headSpacer} />
      {blotterTab === "trades" && (
        <>
          <span data-testid="blotter-count" className={styles.count}>
            {trades.length} trades
          </span>
          <QuickFilter value={quickFilter} onChange={setQuickFilter} />
          <button
            type="button"
            data-testid="export-csv"
            className={styles.csvChip}
            onClick={exportCsv}
          >
            ⤓ CSV
          </button>
        </>
      )}
    </div>
  );
}
