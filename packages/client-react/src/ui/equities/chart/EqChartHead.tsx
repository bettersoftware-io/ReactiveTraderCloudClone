import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { InstrumentTabs } from "../tabs/InstrumentTabs";
import { ChartTypePills } from "./ChartTypePills";
import { DrawToolPills } from "./DrawToolPills";
import { IndicatorPills } from "./IndicatorPills";
import { TimeframePills } from "./TimeframePills";

import styles from "./EqChartHead.module.css";

/**
 * The chart panel's head-bar control row: instrument tabs, chart-type
 * pills, indicator pills, timeframe pills, and draw-tool pills, left to
 * right — hoisted out of the panel body so the dock's single head strip
 * renders them inline instead of a second in-body row (mirrors the
 * prototype's ChartPanelControls). Registered as eq-chart's headControls.
 */
export function EqChartHead(): ReactElement {
  const { useEqWorkspace, useEqDrawings } = useViewModel();
  const {
    state,
    setTimeframe,
    setChartType,
    toggleIndicator,
    togglePane,
    toggleYScale,
  } = useEqWorkspace();
  const { state: drawState, setTool } = useEqDrawings();

  return (
    <div className={styles.head}>
      <div className={styles.tabsWrap}>
        <InstrumentTabs />
      </div>
      <ChartTypePills kind={state.chartType} onSet={setChartType} />
      <IndicatorPills
        active={state.indicators}
        onToggle={toggleIndicator}
        activePanes={state.panes}
        onTogglePane={togglePane}
        yScale={state.yScale}
        onToggleYScale={toggleYScale}
      />
      <TimeframePills tf={state.timeframe} onSet={setTimeframe} />
      <DrawToolPills tool={drawState.tool} onSet={setTool} />
    </div>
  );
}
