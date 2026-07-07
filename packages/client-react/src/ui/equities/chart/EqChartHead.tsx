import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { InstrumentTabs } from "../tabs/InstrumentTabs";
import { TimeframePills } from "./TimeframePills";

import styles from "./EqChartHead.module.css";

/**
 * The chart panel's head-bar control row: instrument tabs (left) + timeframe
 * pills (right) — hoisted out of the panel body so the dock's single head
 * strip renders them inline instead of a second in-body row (mirrors the
 * prototype's ChartPanelControls). Registered as eq-chart's headControls.
 */
export function EqChartHead(): ReactElement {
  const { useEqWorkspace } = useViewModel();
  const { state, setTimeframe } = useEqWorkspace();

  return (
    <div className={styles.head}>
      <InstrumentTabs />
      <TimeframePills tf={state.timeframe} onSet={setTimeframe} />
    </div>
  );
}
