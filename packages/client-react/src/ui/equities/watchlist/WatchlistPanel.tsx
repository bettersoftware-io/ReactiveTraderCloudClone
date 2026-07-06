import { type ReactElement, useCallback, useRef, useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { useRankGlide } from "./useRankGlide";
import { WatchlistRow } from "./WatchlistRow";
import { sortWatchlistRows, type WatchlistRowInput } from "./watchlistVm";

import styles from "./WatchlistPanel.module.css";

/**
 * The equities watchlist rail — one row per `useWatchlist()` instrument,
 * ordered by the shared `useEqWatchlistSort()` preference (the head's ⇅
 * control). Each row owns its own `useEquityQuote(symbol)` subscription (the
 * app has no bulk-quotes hook) and reports ticks up via `onQuote` so this
 * panel can order by %chg/price without duplicating quote streams; rows keep
 * their symbol as React key across re-sorts so `useRankGlide` can glide the
 * SAME row elements to their new rank instead of remounting them.
 */
export function WatchlistPanel(): ReactElement {
  const { useWatchlist, useEqWorkspace, useEqWatchlistSort } = useViewModel();
  const instruments = useWatchlist();
  const workspace = useEqWorkspace();
  const { sort } = useEqWatchlistSort();
  const [quotes, setQuotes] = useState<Record<string, QuoteSnapshot>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const reportQuote = useCallback(
    (symbol: string, last: number, changePct: number) => {
      setQuotes((prev) => {
        const existing = prev[symbol];
        if (
          existing &&
          existing.last === last &&
          existing.changePct === changePct
        )
          return prev;
        return { ...prev, [symbol]: { last, changePct } };
      });
    },
    [],
  );

  const rowInputs: readonly WatchlistRowInput[] = instruments.map((inst) => {
    const q = quotes[inst.symbol];
    return {
      symbol: inst.symbol,
      name: inst.name,
      last: q?.last ?? null,
      changePct: q?.changePct ?? null,
    };
  });
  const rows = sortWatchlistRows(rowInputs, sort);

  useRankGlide(
    listRef,
    rows.map((r) => {
      return r.symbol;
    }),
  );

  if (instruments.length === 0) {
    return <div className={styles.empty}>NO INSTRUMENTS</div>;
  }

  return (
    <div className={styles.panel} ref={listRef}>
      {rows.map((row) => {
        return (
          <WatchlistRow
            key={row.symbol}
            symbol={row.symbol}
            name={row.name}
            selected={row.symbol === workspace.state.sel}
            onSelect={workspace.select}
            onQuote={reportQuote}
          />
        );
      })}
    </div>
  );
}

interface QuoteSnapshot {
  last: number;
  changePct: number;
}
