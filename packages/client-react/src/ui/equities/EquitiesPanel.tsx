import { type ReactElement, useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { OrdersBlotter } from "./blotter/OrdersBlotter";
import { PositionsBlotter } from "./blotter/PositionsBlotter";
import { DepthLadder } from "./chart/DepthLadder";
import { PriceChart } from "./chart/PriceChart";
import { InstrumentTabs } from "./tabs/InstrumentTabs";
import { OrderTicket } from "./ticket/OrderTicket";
import { SectorHeatmap } from "./watchlist/SectorHeatmap";
import { Watchlist } from "./watchlist/Watchlist";

import styles from "./EquitiesPanel.module.css";

/**
 * Equities module root — composes all sub-panels around the shared
 * eqWorkspace machine's selection (the same source of truth the instrument
 * tabs read/write directly), so tab clicks and watchlist-row clicks stay in
 * sync through one machine instead of a locally-lifted `useState`.
 * Superseded by the four-panel dock layout in a later phase.
 */
export function EquitiesPanel(): ReactElement {
  const { useEqWorkspace } = useViewModel();
  const { state, select } = useEqWorkspace();
  const [blotterView, setBlotterView] = useState<BlotterView>("orders");

  const activeSymbol = state.sel;

  return (
    <div className={styles.panel}>
      {/* Instrument tabs row */}
      <div className={styles.tabs}>
        <InstrumentTabs />
      </div>

      <div className={styles.body}>
        {/* Left column: Watchlist (top) + Sector heatmap (bottom) */}
        <div className={styles.watchlistPane}>
          <div className={styles.sectionHeading}>WATCHLIST</div>
          <Watchlist selectedSymbol={activeSymbol} onSelect={select} />
        </div>
        <div className={styles.sectorPane}>
          <div className={styles.sectionHeading}>SECTORS</div>
          <SectorHeatmap selectedSymbol={activeSymbol} onSelect={select} />
        </div>

        {/* Centre column: chart (top) + order ticket (bottom) */}
        {activeSymbol ? (
          <>
            <div className={styles.chartPane}>
              <div className={styles.sectionHeading}>
                {activeSymbol} — PRICE CHART
              </div>
              <div className={styles.candleChart}>
                <PriceChart symbol={activeSymbol} />
              </div>
            </div>
            <div className={styles.ticketPane}>
              <div className={styles.sectionHeading}>ORDER TICKET</div>
              <OrderTicket symbol={activeSymbol} />
            </div>
          </>
        ) : (
          <div className={styles.chartPane}>
            <div className={styles.placeholder}>SELECT AN INSTRUMENT</div>
          </div>
        )}

        {/* Right column: depth ladder (top) + blotter tabs (bottom) */}
        {activeSymbol ? (
          <div className={styles.depthPane}>
            <div className={styles.sectionHeading}>DEPTH</div>
            <DepthLadder symbol={activeSymbol} />
          </div>
        ) : (
          <div className={styles.depthPane} />
        )}

        <div className={styles.blotterPane}>
          <div className={styles.blotterTabs}>
            <button
              type="button"
              data-active={blotterView === "orders" ? "true" : "false"}
              className={styles.blotterTab}
              onClick={() => {
                setBlotterView("orders");
              }}
            >
              ORDERS
            </button>
            <button
              type="button"
              data-active={blotterView === "positions" ? "true" : "false"}
              className={styles.blotterTab}
              onClick={() => {
                setBlotterView("positions");
              }}
            >
              POSITIONS
            </button>
          </div>
          {blotterView === "orders" ? <OrdersBlotter /> : <PositionsBlotter />}
        </div>
      </div>
    </div>
  );
}

type BlotterView = "orders" | "positions";
