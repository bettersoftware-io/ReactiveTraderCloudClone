import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { InstrumentTabs } from "../tabs/InstrumentTabs";
import { ChartTypePills } from "./ChartTypePills";
import { ComparePills } from "./ComparePills";
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
  const { useEqWorkspace, useEqDrawings, useWatchlist } = useViewModel();
  const {
    state,
    setTimeframe,
    setChartType,
    toggleIndicator,
    togglePane,
    toggleYScale,
    setCompare,
  } = useEqWorkspace();
  const { state: drawState, setTool } = useEqDrawings();
  const candidates = useWatchlist()
    .map((i) => {
      return i.symbol;
    })
    .filter((sym) => {
      return sym !== state.sel;
    });

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
        comparing={state.compare !== null}
      />
      <ComparePills
        candidates={candidates}
        active={state.compare}
        onSelect={setCompare}
      />
      <TimeframePills tf={state.timeframe} onSet={setTimeframe} />
      <DrawToolPills tool={drawState.tool} onSet={setTool} />
    </div>
  );
}
