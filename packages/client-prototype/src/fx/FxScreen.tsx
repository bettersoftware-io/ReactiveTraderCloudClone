import type { CSSProperties, ReactElement } from "react";
import { useRef, useState } from "react";

import { AnalyticsView } from "#/fx/Analytics/AnalyticsView";
import {
  FxBlotterHeadControls,
  FxBlotterPanel,
} from "#/fx/Blotter/FxBlotterPanel";
import styles from "#/fx/FxScreen.module.css";
import type { Filter } from "#/fx/LiveRates/FilterChips";
import {
  LiveRatesHeadControls,
  LiveRatesPanel,
} from "#/fx/LiveRates/LiveRatesPanel";
import type { PanelId } from "#/fx/layout/useDockState";
import { useDockState } from "#/fx/layout/useDockState";
import { PositionsView } from "#/fx/Positions/PositionsView";
import { useFxBlotter } from "#/fx/useFxBlotter";
import { useFxRates } from "#/fx/useFxRates";
import { Panel } from "#/layout/Panel";
import { SplitHandle } from "#/layout/SplitHandle";
import { useSplit } from "#/layout/useSplit";

// PROTO 823: the persisted dock defaults — tiles-vs-blotter, aside width
// (as a fraction of the ~1320px reference stage), and analytics-vs-positions.
const LEFT_SPLIT_INITIAL = 0.66; // fxStackR
const MAIN_SPLIT_INITIAL = 0.73; // asideW:360 ≈ 1 - 360/1320
const ASIDE_SPLIT_INITIAL = 0.5; // fxRightR

// Named (not inline string literal) `id` props: Biome's useUniqueElementIds
// rule assumes any JSX `id="…"` is the DOM attribute, but PanelId here is a
// dock-region key, not a DOM id — Panel doesn't put it on an element at all.
const TILES_PANEL: PanelId = "tiles";
const FXBLOT_PANEL: PanelId = "fxblot";
const ANA_PANEL: PanelId = "ana";
const POS_PANEL: PanelId = "pos";

// The FX dock (PROTO 349-520): a left column (Live Rates over the FX
// Blotter) beside an aside column (Analytics over Positions), the two
// columns themselves split. Three independent `useSplit`s own each ratio;
// FxScreen.module.css turns them into flex-grow splits via inherited
// `--main-ratio`/`--left-ratio`/`--aside-ratio` custom properties, and
// handles maximize/aside-collapse off the `data-max-panel`/
// `data-aside-collapsed` attributes set on the root below.
export function FxScreen(): ReactElement {
  const [filter, setFilter] = useState<Filter>("All");
  const [view, setView] = useState<"rates" | "watch">("rates");
  const [blotView, setBlotView] = useState<"blotter" | "activity">("blotter");
  const [showCharts, setShowCharts] = useState(false);

  const rates = useFxRates();
  const blotter = useFxBlotter(rates.trades);
  const dock = useDockState();

  const screenRef = useRef<HTMLDivElement | null>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const asideColRef = useRef<HTMLDivElement | null>(null);

  const leftSplit = useSplit({
    storageKey: "fxStackR",
    orientation: "h",
    initial: LEFT_SPLIT_INITIAL,
    containerRef: leftColRef,
  });

  const mainSplit = useSplit({
    storageKey: "fxAsideR",
    orientation: "v",
    initial: MAIN_SPLIT_INITIAL,
    containerRef: screenRef,
  });

  const asideSplit = useSplit({
    storageKey: "fxRightR",
    orientation: "h",
    initial: ASIDE_SPLIT_INITIAL,
    containerRef: asideColRef,
  });

  function toggleCharts(): void {
    setShowCharts((prev) => {
      return !prev;
    });
  }

  const geom = {
    "--main-ratio": mainSplit.ratio,
    "--left-ratio": leftSplit.ratio,
    "--aside-ratio": asideSplit.ratio,
  } as CSSProperties;

  return (
    <div
      ref={screenRef}
      className={styles.screen}
      data-testid="fx-screen"
      data-max-panel={dock.maxPanel ?? ""}
      data-aside-collapsed={String(dock.asideCollapsed)}
      style={geom}
    >
      <div className={styles.leftCol} ref={leftColRef}>
        <div className={styles.tilesRegion}>
          <Panel
            id={TILES_PANEL}
            head={<span className={styles.regionLabel}>Live Rates</span>}
            headControls={
              <LiveRatesHeadControls
                view={view}
                onView={setView}
                showCharts={showCharts}
                onToggleCharts={toggleCharts}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <LiveRatesPanel
              rates={rates}
              filter={filter}
              onFilter={setFilter}
              view={view}
              showCharts={showCharts}
            />
          </Panel>
        </div>

        <div className={styles.leftHandle}>
          <SplitHandle api={leftSplit} />
        </div>

        <div className={styles.blotterRegion}>
          <Panel
            id={FXBLOT_PANEL}
            head={<span className={styles.regionLabel}>FX Blotter</span>}
            headControls={
              <FxBlotterHeadControls
                api={blotter}
                view={blotView}
                onView={setBlotView}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <FxBlotterPanel
              api={blotter}
              activity={rates.activity}
              view={blotView}
              newRowId={rates.newRowId}
            />
          </Panel>
        </div>
      </div>

      <div className={styles.mainHandle}>
        <SplitHandle api={mainSplit} />
      </div>

      <div className={styles.aside} ref={asideColRef}>
        {dock.asideCollapsed ? (
          <AsideCollapsedStrip onRestore={dock.toggleAside} />
        ) : (
          <>
            <div className={styles.anaRegion}>
              <Panel
                id={ANA_PANEL}
                head={<span className={styles.regionLabel}>◉ Analytics</span>}
                headAccessory="⊕"
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <AnalyticsView pnl={rates.pnl} />
              </Panel>
            </div>

            <div className={styles.asideHandle}>
              <SplitHandle api={asideSplit} />
            </div>

            <div className={styles.posRegion}>
              <Panel
                id={POS_PANEL}
                head={<span className={styles.regionLabel}>◎ Positions</span>}
                headAccessory="⊕"
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <PositionsView />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface AsideCollapsedStripProps {
  onRestore(): void;
}

// PROTO 1226 (asideCol collapsed): a narrow vertical strip of restore
// buttons, one per aside panel, standing in for the full Analytics/Positions
// stack while it's collapsed.
function AsideCollapsedStrip(props: AsideCollapsedStripProps): ReactElement {
  const { onRestore } = props;

  return (
    <div className={styles.collapsedStrip}>
      <button type="button" className={styles.stripBtn} onClick={onRestore}>
        ⛶ ANALYTICS
      </button>
      <button type="button" className={styles.stripBtn} onClick={onRestore}>
        ⛶ POSITIONS
      </button>
    </div>
  );
}
