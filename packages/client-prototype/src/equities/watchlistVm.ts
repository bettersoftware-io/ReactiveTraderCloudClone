import { EQ_META, EQ_SYMS } from "#/equities/equitiesData";
import type { EqSym, WlSort } from "#/equities/types";

const FLASH_MS = 650;

interface FlashEvent {
  dir: 1 | -1;
  ts: number;
}

export interface WatchlistInput {
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  sel: EqSym;
  wlSort: WlSort;
  now: number;
}

export interface WatchRowVm {
  sym: EqSym;
  name: string;
  last: string;
  chg: string;
  up: boolean;
  selected: boolean;
  flashOn: boolean;
}

interface RankedRow extends WatchRowVm {
  lastN: number;
  chgN: number;
}

// PROTO L1337: one row per symbol, %-change vs the smoothed prev, a brief
// tick flash, then sorted by the active mode (A-Z / %chg desc / price desc).
export function watchlistVm(input: WatchlistInput): WatchRowVm[] {
  const { rates, prev, flash, sel, wlSort, now } = input;

  const rows: RankedRow[] = EQ_SYMS.map((sym) => {
    const last = rates[sym];
    const chgPct = ((last - prev[sym]) / prev[sym]) * 100;
    const up = chgPct >= 0;
    const fl = flash[sym];
    const flashOn = fl != null && now - fl.ts < FLASH_MS;

    return {
      sym,
      name: EQ_META[sym].name,
      last: last.toFixed(2),
      chg: `${up ? "+" : ""}${chgPct.toFixed(2)}%`,
      up,
      selected: sym === sel,
      flashOn,
      lastN: last,
      chgN: chgPct,
    };
  });

  if (wlSort === "chg") {
    rows.sort((a, b) => {
      return b.chgN - a.chgN;
    });
  } else if (wlSort === "price") {
    rows.sort((a, b) => {
      return b.lastN - a.lastN;
    });
  }

  return rows.map((r) => {
    return {
      sym: r.sym,
      name: r.name,
      last: r.last,
      chg: r.chg,
      up: r.up,
      selected: r.selected,
      flashOn: r.flashOn,
    };
  });
}
