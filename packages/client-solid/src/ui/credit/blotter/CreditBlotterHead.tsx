import type { JSX } from "solid-js";
import { createMemo } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { useCreditView } from "#/ui/credit/useCreditView";
import { QuickFilter } from "#/ui/fx/blotter/QuickFilter";
import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

import { deriveCreditTrades } from "./creditTradesVm";

/** The credit-blotter panel's head slot: the single, always-active
 * "▤ Credit Blotter" tab (this panel has only one view, so nothing ever
 * toggles it), then — mirroring FxBlotterHead — the live UNFILTERED trade
 * count, the quick-filter input, and the CSV export chip, right-aligned
 * after the spacer. Reuses the FX heads' chrome (PanelHeadTabs.module.css)
 * so the credit dock's heads read as one chrome family with FX. Renders
 * inside the panel header via InhouseLayoutEngine's headRegistry, shares the
 * CreditViewContext seam with the body (CreditBlotter owns the export
 * handler handoff via setExportCsvHandler, registered in its own effect),
 * and reads the trade count straight off the ViewModel. */
export function CreditBlotterHead(): JSX.Element {
  const { quickFilter, setQuickFilter, exportCsv } = useCreditView();
  const { useRfqs, useAllQuotes, useInstruments, useDealers } = useViewModel();
  const rfqs = useRfqs();
  const allQuotes = useAllQuotes();
  const instruments = useInstruments();
  const dealers = useDealers();
  const tradeCount = createMemo((): number => {
    return deriveCreditTrades(rfqs(), allQuotes(), instruments(), dealers())
      .length;
  });

  return (
    <div class={styles.headTabs}>
      <span
        data-testid="credit-blotter-head-title"
        data-active="true"
        class={styles.headTab}
      >
        ▤ Credit Blotter
      </span>
      <span class={styles.headSpacer} />
      <span data-testid="blotter-count" class={styles.count}>
        {tradeCount()} trades
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
    </div>
  );
}
