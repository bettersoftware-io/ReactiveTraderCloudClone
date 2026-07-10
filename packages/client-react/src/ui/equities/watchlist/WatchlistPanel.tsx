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
 *
 * Row ORDER vs row VALUES (I4): the live "chg"/"price" sort recomputes on
 * every one of the up-to-six independent 500ms quote ticks — but each row's
 * displayed price/%chg is already live via its OWN useEquityQuote(symbol)
 * subscription, so the sort recompute here only ever affects ROW ORDER.
 * `useRankGlide` coalesces those order changes to at most one commit per
 * glide window and returns the order actually safe to render (`committed`,
 * NOT the raw `rows`/`candidateOrder` computed this render) — rendering off
 * anything else would let the DOM's physical row order race ahead of what
 * the glide is animating.
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
        ) {
          return prev;
        }

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
  const candidateOrder = sortWatchlistRows(rowInputs, sort).map((row) => {
    return row.symbol;
  });
  const committedOrder = useRankGlide(listRef, candidateOrder);

  if (instruments.length === 0) {
    return <div className={styles.empty}>NO INSTRUMENTS</div>;
  }

  const nameBySymbol = new Map(
    instruments.map((inst) => {
      return [inst.symbol, inst.name] as const;
    }),
  );

  return (
    <div className={styles.panel} ref={listRef}>
      {committedOrder.map((symbol) => {
        const name = nameBySymbol.get(symbol);

        // A committed symbol can briefly outlive its instrument (removed from
        // the watchlist while a glide was still in flight) — skip it rather
        // than render a nameless row; the next settled commit drops it.
        if (name === undefined) {
          return null;
        }

        return (
          <WatchlistRow
            key={symbol}
            symbol={symbol}
            name={name}
            selected={symbol === workspace.state.sel}
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
