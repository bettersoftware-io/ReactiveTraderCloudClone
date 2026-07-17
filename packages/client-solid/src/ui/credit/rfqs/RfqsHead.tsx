import type { JSX } from "solid-js";
import { createMemo } from "solid-js";

import { RfqState } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

import { RfqFilterPills } from "./RfqFilterPills";

/** The credit-rfqs panel's head slot: a single, always-active "◳ RFQs" title
 * (this panel has only one view, so nothing ever toggles it — mirrors
 * AnalyticsHead/PositionsHead) plus the LIVE/CLOSED/ALL filter pills
 * (RfqFilterPills), which WRITE the shared useCreditRfqFilterPreference seam
 * RfqsPanel only reads (the same head/body split LiveRatesHead/LiveRatesPanel
 * use for viewMode). The LIVE count is derived here from useRfqs — "(N)" of
 * Open rfqs when N > 0, "" when zero (PROTO useCreditRfqs.ts liveCount). */
export function RfqsHead(): JSX.Element {
  const { useRfqs, useCreditRfqFilterPreference } = useViewModel();
  const rfqs = useRfqs();
  const { filter, setFilter } = useCreditRfqFilterPreference();
  const liveCount = createMemo((): string => {
    const liveRfqs = rfqs().filter((rfq) => {
      return rfq.state === RfqState.Open;
    });
    return liveRfqs.length > 0 ? `(${liveRfqs.length})` : "";
  });

  return (
    <div class={styles.headTabs}>
      <span
        data-testid="rfqs-head-title"
        data-active="true"
        class={styles.headTab}
      >
        ◳ RFQs
      </span>
      <span class={styles.headSpacer} />
      <RfqFilterPills
        filter={filter()}
        liveCount={liveCount()}
        onFilter={setFilter}
      />
    </div>
  );
}
