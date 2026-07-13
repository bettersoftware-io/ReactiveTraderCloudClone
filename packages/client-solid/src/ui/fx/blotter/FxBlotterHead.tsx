import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { useFxView } from "#/ui/fx/useFxView";
import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

import { QuickFilter } from "./QuickFilter";

/** The fx-blotter panel's head slot (PROTO L471/L478): FX Blotter / Activity
 * tabs, plus — only while the Trades tab is showing — the live trade count,
 * the quick-filter input, and the CSV export chip. Mirrors LiveRatesHead:
 * renders inside the panel header via InhouseLayoutEngine's headRegistry,
 * reads/writes the shared FxViewContext seam, and reads the trade count
 * straight off the ViewModel (FxBlotter owns the export handler handoff via
 * setExportCsvHandler, registered in its own effect). */
export function FxBlotterHead(): JSX.Element {
  const { blotterTab, setBlotterTab, quickFilter, setQuickFilter, exportCsv } =
    useFxView();
  const { useTrades } = useViewModel();
  const trades = useTrades();

  return (
    <div class={styles.headTabs}>
      <button
        type="button"
        data-testid="blotter-tab-trades"
        data-active={blotterTab() === "trades" ? "true" : "false"}
        class={styles.headTab}
        onClick={() => {
          setBlotterTab("trades");
        }}
      >
        ▤ FX Blotter
      </button>
      <button
        type="button"
        data-testid="blotter-tab-activity"
        data-active={blotterTab() === "activity" ? "true" : "false"}
        class={styles.headTab}
        onClick={() => {
          setBlotterTab("activity");
        }}
      >
        ⚡ Activity
      </button>
      <span class={styles.headSpacer} />
      <Show when={blotterTab() === "trades"}>
        <span data-testid="blotter-count" class={styles.count}>
          {trades().length} trades
        </span>
        <QuickFilter value={quickFilter()} onChange={setQuickFilter} />
        <button
          type="button"
          data-testid="export-csv"
          class={styles.csvChip}
          onClick={exportCsv}
        >
          ⤓ CSV
        </button>
      </Show>
    </div>
  );
}
