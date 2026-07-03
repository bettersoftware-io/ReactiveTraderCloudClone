import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import type { EqBlotView } from "#/equities/Blotter/EqBlotterPanel";
import {
  EqBlotterPanel,
  EqBlotterPanelControls,
} from "#/equities/Blotter/EqBlotterPanel";
import { ChartPanel, ChartPanelControls } from "#/equities/Chart/ChartPanel";
import styles from "#/equities/EquitiesScreen.module.css";
import { positionsVm } from "#/equities/positionsVm";
import { OrderTicketPanel } from "#/equities/Ticket/OrderTicketPanel";
import { useEqChart } from "#/equities/useEqChart";
import type { EqPanelId } from "#/equities/useEqDock";
import { useEqDock } from "#/equities/useEqDock";
import { useEqTicket } from "#/equities/useEqTicket";
import { useEquities } from "#/equities/useEquities";
import { WatchlistPanel } from "#/equities/Watchlist/WatchlistPanel";
import { watchlistVm } from "#/equities/watchlistVm";
import { Panel } from "#/layout/Panel";
import { SplitHandle } from "#/layout/SplitHandle";
import { useSplit } from "#/layout/useSplit";

const MAIN_SPLIT_INITIAL = 0.78; // eqAsideW 290 ≈ 1 - 290/1320
const CENTER_SPLIT_INITIAL = 0.66; // eqCenterR
const ASIDE_SPLIT_INITIAL = 0.5; // eqRightR
const NOW_INTERVAL_MS = 400;

// Named panel-id props (same useUniqueElementIds rationale as FxScreen).
const CHART_PANEL: EqPanelId = "chart";
const EBLOT_PANEL: EqPanelId = "eblot";
const TICKET_PANEL: EqPanelId = "ticket";
const WATCH_PANEL: EqPanelId = "watch";

// The Equities dock (PROTO 596-685): a center column (Chart over the Orders/
// Positions blotter, split eqCenterR) beside an aside (Order Ticket over the
// Watchlist, split eqRightR), the two split by eqAsideW. All four panels
// maximize; maximizing a center panel collapses the aside to its restore strip
// (useEqDock.rightCollapsed), while maximizing an aside panel collapses only
// its aside sibling via CSS.
export function EquitiesScreen(): ReactElement {
  const eng = useEquities();
  const chart = useEqChart();
  const ticket = useEqTicket(chart.sel, eng.rates);
  const dock = useEqDock();
  const [blotView, setBlotView] = useState<EqBlotView>("orders");
  const [now, setNow] = useState(() => {
    return Date.now();
  });

  const screenRef = useRef<HTMLDivElement | null>(null);
  const centerColRef = useRef<HTMLDivElement | null>(null);
  const asideColRef = useRef<HTMLDivElement | null>(null);

  const mainSplit = useSplit({
    storageKey: "eqAsideR",
    orientation: "v",
    initial: MAIN_SPLIT_INITIAL,
    containerRef: screenRef,
  });
  const centerSplit = useSplit({
    storageKey: "eqCenterR",
    orientation: "h",
    initial: CENTER_SPLIT_INITIAL,
    containerRef: centerColRef,
  });
  const asideSplit = useSplit({
    storageKey: "eqRightR",
    orientation: "h",
    initial: ASIDE_SPLIT_INITIAL,
    containerRef: asideColRef,
  });

  // A shared 400ms clock drives the tick-flash windows (watchlist rows, the
  // instrument header, the last candle) without each cell owning a timer.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, NOW_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, []);

  const positions = positionsVm(ticket.orders, eng.rates);
  const rows = watchlistVm({
    rates: eng.rates,
    prev: eng.prev,
    flash: eng.flash,
    sel: chart.sel,
    wlSort: chart.wlSort,
    now,
  });

  const geom = {
    "--main-ratio": mainSplit.ratio,
    "--center-ratio": centerSplit.ratio,
    "--aside-ratio": asideSplit.ratio,
  } as CSSProperties;

  return (
    <div
      ref={screenRef}
      className={styles.screen}
      data-testid="equities-screen"
      data-max-panel={dock.maxPanel ?? ""}
      style={geom}
    >
      <div className={styles.centerCol} ref={centerColRef}>
        <div className={styles.chartRegion}>
          <Panel
            id={CHART_PANEL}
            head={<span className={styles.regionLabel}>◈ Chart</span>}
            headControls={<ChartPanelControls chart={chart} />}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <ChartPanel
              chart={chart}
              rates={eng.rates}
              prev={eng.prev}
              flash={eng.flash}
              vol={eng.vol}
              now={now}
            />
          </Panel>
        </div>

        <div className={styles.centerHandle}>
          <SplitHandle api={centerSplit} />
        </div>

        <div className={styles.eblotRegion}>
          <Panel
            id={EBLOT_PANEL}
            head={
              <span className={styles.regionLabel}>▤ Orders / Positions</span>
            }
            headControls={
              <EqBlotterPanelControls
                view={blotView}
                onView={setBlotView}
                ordersCount={ticket.orders.length}
                positionsCount={positions.length}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <EqBlotterPanel
              orders={ticket.orders}
              positions={positions}
              view={blotView}
              newOrderId={ticket.newOrderId}
            />
          </Panel>
        </div>
      </div>

      <div className={styles.mainHandle}>
        <SplitHandle api={mainSplit} />
      </div>

      <div className={styles.aside} ref={asideColRef}>
        {dock.rightCollapsed ? (
          <RightCollapsedStrip onRestore={dock.restore} />
        ) : (
          <>
            <div className={styles.ticketRegion}>
              <Panel
                id={TICKET_PANEL}
                head={
                  <span className={styles.regionLabel}>✚ Order Ticket</span>
                }
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <OrderTicketPanel
                  api={ticket}
                  sel={chart.sel}
                  last={eng.rates[chart.sel]}
                />
              </Panel>
            </div>

            <div className={styles.asideHandle}>
              <SplitHandle api={asideSplit} />
            </div>

            <div className={styles.watchRegion}>
              <Panel
                id={WATCH_PANEL}
                head={<span className={styles.regionLabel}>☰ Watchlist</span>}
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <WatchlistPanel
                  rows={rows}
                  wlSort={chart.wlSort}
                  onSelect={chart.selectEq}
                  onCycleSort={chart.cycleWlSort}
                />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface RightCollapsedStripProps {
  onRestore(): void;
}

// PROTO L647 (eqRightCol collapsed): the aside collapsed to a two-bar restore
// strip, shown whenever a center panel (chart/eblot) is maximized.
function RightCollapsedStrip(props: RightCollapsedStripProps): ReactElement {
  const { onRestore } = props;

  return (
    <div className={styles.collapsedStrip}>
      <button type="button" className={styles.stripBtn} onClick={onRestore}>
        ⛶ ORDER TICKET
      </button>
      <button type="button" className={styles.stripBtn} onClick={onRestore}>
        ⛶ WATCHLIST
      </button>
    </div>
  );
}
