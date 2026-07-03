import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { META, ORDER, parseNotional, RFQ_THRESHOLD } from "#/fx/fxData";
import type { Filter } from "#/fx/LiveRates/FilterChips";
import { FilterChips } from "#/fx/LiveRates/FilterChips";
import styles from "#/fx/LiveRates/LiveRatesPanel.module.css";
import type { TileVm } from "#/fx/LiveRates/RateTile";
import { RateTile } from "#/fx/LiveRates/RateTile";
import { TileExecOverlay } from "#/fx/LiveRates/TileExecOverlay";
import type { WatchRow } from "#/fx/LiveRates/WatchlistView";
import { WatchlistView } from "#/fx/LiveRates/WatchlistView";
import type { PairMeta, Sym, TileState } from "#/fx/types";
import type { RatesApi } from "#/fx/useFxRates";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

export interface LiveRatesPanelProps {
  rates: RatesApi;
  filter: Filter;
  onFilter(f: Filter): void;
  view: "rates" | "watch";
  showCharts: boolean;
}

export interface LiveRatesHeadControlsProps {
  view: "rates" | "watch";
  onView(v: "rates" | "watch"): void;
  showCharts: boolean;
  onToggleCharts(): void;
}

const NOW_TICK_MS = 250;
// Mirrors useFxRates' internal MAX_NOTIONAL (not exported) — a tile's
// notional is invalid past this cap regardless of what the rates api ends up
// doing with it (PROTO 1266: `invalid=Number.isNaN(n)||n>1e9`).
const MAX_NOTIONAL_CAP = 1e9;
// PROTO 1256: `fl&&(S.now-fl.ts<650)` — a rate flash stays "on" for 650ms.
const FLASH_WINDOW_MS = 650;

// PROTO 349-356 (panTiles head): the Live Rates/Watchlist view toggle and the
// CHARTS switch. Rendered as Panel's `headControls` (one 38px bar shared
// with the region label and maximize button) instead of a second head bar
// inside this panel's own body.
export function LiveRatesHeadControls(
  props: LiveRatesHeadControlsProps,
): ReactElement {
  const { view, onView, showCharts, onToggleCharts } = props;

  return (
    <>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "rates")}
        onClick={() => {
          onView("rates");
        }}
      >
        ◧ Live Rates
      </button>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "watch")}
        onClick={() => {
          onView("watch");
        }}
      >
        ☰ Watchlist
      </button>
      <div className={styles.spacer} />
      <button
        type="button"
        className={styles.chartsBtn}
        data-active={String(showCharts)}
        onClick={onToggleCharts}
      >
        CHARTS
      </button>
    </>
  );
}

export function LiveRatesPanel(props: LiveRatesPanelProps): ReactElement {
  const { rates, filter, onFilter, view, showCharts } = props;
  const { prefs } = usePreferences();
  const now = useNowTick();
  const gridRef = useRef<HTMLDivElement | null>(null);
  useFlip(gridRef, filter, { reduce: prefs.reduceMotion });

  const syms = ORDER.filter((sym) => {
    return filter === "All" || sym.includes(filter);
  });

  return (
    <div className={styles.body}>
      <FilterChips value={filter} onChange={onFilter} />

      {view === "rates" ? (
        <div className={styles.grid} ref={gridRef}>
          {syms.map((sym) => {
            return (
              <TileCell
                key={sym}
                sym={sym}
                vm={buildTileVm(sym, rates, showCharts, now)}
                tile={rates.tiles[sym]}
                meta={META[sym]}
                now={now}
                onDismiss={() => {
                  rates.onDismiss(sym);
                }}
              />
            );
          })}
        </div>
      ) : (
        <WatchlistView
          rows={syms.map((sym) => {
            return buildWatchRow(sym, rates);
          })}
        />
      )}
    </div>
  );
}

interface TileCellProps {
  sym: Sym;
  vm: TileVm;
  tile: TileState;
  meta: PairMeta;
  now: number;
  onDismiss(): void;
}

function TileCell(props: TileCellProps): ReactElement {
  const { sym, vm, tile, meta, now, onDismiss } = props;
  const overlayHostRef = useRef<HTMLDivElement | null>(null);

  // The overlay (Task 4) is pure — it renders its Sell/Buy quote and
  // dismiss/cancel/reject buttons as plain data-action/data-side markers
  // with no handlers attached. A native listener on a ref, scoped to just
  // the overlay subtree (not the whole cell), reads which one fired and
  // routes it to the rates api. Scoping it here — rather than a JSX
  // onClick on the cell — keeps this from double-firing the tile's own
  // Sell/Buy price buttons (which already carry the same data-side
  // attributes and their own onClick), and a plain wrapper div stays a
  // non-interactive element: the buttons inside remain the real,
  // keyboard-reachable interactive elements, and their native `click`
  // (fired for both mouse and Enter/Space activation) still bubbles here.
  useEffect(() => {
    const host = overlayHostRef.current;

    if (host == null) {
      return;
    }

    function handleClick(e: Event): void {
      const target = e.target as HTMLElement;
      const actionEl = target.closest<HTMLElement>("[data-action],[data-side]");

      if (actionEl == null) {
        return;
      }

      if (actionEl.hasAttribute("data-action")) {
        onDismiss();
      } else if (actionEl.getAttribute("data-side") === "sell") {
        vm.onSell();
      } else if (actionEl.getAttribute("data-side") === "buy") {
        vm.onBuy();
      }
    }

    host.addEventListener("click", handleClick);

    return () => {
      host.removeEventListener("click", handleClick);
    };
  });

  return (
    <div data-flip-key={sym} className={styles.cell}>
      <RateTile
        vm={vm}
        overlay={
          <div ref={overlayHostRef} className={styles.overlayHost}>
            <TileExecOverlay tile={tile} meta={meta} now={now} />
          </div>
        }
      />
    </div>
  );
}

function useNowTick(): number {
  const [now, setNow] = useState<number>(Date.now);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, NOW_TICK_MS);

    return () => {
      clearInterval(id);
    };
  }, []);

  return now;
}

function priceUnit(d: number): number {
  return d === 3 ? 0.01 : 0.0001;
}

interface Move {
  movePips: number;
  moveUp: boolean;
}

// Shared by the tile grid (buildTileVm) and the Watchlist rows
// (buildWatchRow) so the movePips math lives in exactly one place.
function computeMove(sym: Sym, rates: RatesApi): Move {
  const meta = META[sym];
  const rate = rates.rates[sym];
  const open = rates.opens[sym];
  const pu = priceUnit(meta.d);
  const movePips = Math.round((rate - open) / pu);
  const moveUp = rate >= open;

  return { movePips, moveUp };
}

function buildWatchRow(sym: Sym, rates: RatesApi): WatchRow {
  const meta = META[sym];
  const { movePips, moveUp } = computeMove(sym, rates);

  return {
    sym,
    mid: rates.rates[sym].toFixed(meta.d),
    movePips,
    moveUp,
    spread: meta.spread,
    hist: rates.hist[sym],
  };
}

function buildTileVm(
  sym: Sym,
  rates: RatesApi,
  showCharts: boolean,
  now: number,
): TileVm {
  const meta = META[sym];
  const rate = rates.rates[sym];
  const { movePips, moveUp } = computeMove(sym, rates);
  const flashEvent = rates.flash[sym];
  const flashOn = flashEvent != null && now - flashEvent.ts < FLASH_WINDOW_MS;
  const notional = rates.notionals[sym];
  const parsed = parseNotional(notional);
  const notionalInvalid = Number.isNaN(parsed) || parsed > MAX_NOTIONAL_CAP;
  const isRfq = !notionalInvalid && parsed > RFQ_THRESHOLD;

  return {
    sym,
    meta,
    rate,
    movePips,
    moveUp,
    flashOn,
    hist: rates.hist[sym],
    notional,
    notionalInvalid,
    isRfq,
    showCharts,
    onNotional: (v: string) => {
      rates.onNotional(sym, v);
    },
    onReset: () => {
      rates.onReset(sym);
    },
    onSell: () => {
      rates.onSell(sym);
    },
    onBuy: () => {
      rates.onBuy(sym);
    },
  };
}
