import { createMemo, createSignal, For, type JSX, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

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
 * their symbol as the `<For>` key across re-sorts so `useRankGlide` can glide
 * the SAME row elements to their new rank instead of remounting them.
 *
 * Row ORDER vs row VALUES (I4): the live "chg"/"price" sort recomputes on
 * every one of the up-to-six independent 500ms quote ticks — but each row's
 * displayed price/%chg is already live via its OWN useEquityQuote(symbol)
 * subscription, so the sort recompute here only ever affects ROW ORDER.
 * `useRankGlide` coalesces those order changes to at most one commit per
 * glide window and returns the order actually safe to render (`committed`,
 * NOT the raw `rowInputs`/`candidateOrder` computed above) — rendering off
 * anything else would let the DOM's physical row order race ahead of what
 * the glide is animating.
 */
export function WatchlistPanel(): JSX.Element {
  const { useWatchlist, useEqWorkspace, useEqWatchlistSort, usePowerSaver } =
    useViewModel();
  const instruments = useWatchlist();
  const workspace = useEqWorkspace();
  const { sort } = useEqWatchlistSort();
  const { isFreeze } = usePowerSaver();
  const [quotes, setQuotes] = createSignal<Record<string, QuoteSnapshot>>({});
  let listEl: HTMLDivElement | undefined;

  function reportQuote(symbol: string, last: number, changePct: number): void {
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
  }

  const rowInputs = createMemo((): readonly WatchlistRowInput[] => {
    const q = quotes();
    return instruments().map((inst) => {
      const snapshot = q[inst.symbol];
      return {
        symbol: inst.symbol,
        name: inst.name,
        last: snapshot?.last ?? null,
        changePct: snapshot?.changePct ?? null,
      };
    });
  });

  const candidateOrder = createMemo((): readonly string[] => {
    return sortWatchlistRows(rowInputs(), sort()).map((row) => {
      return row.symbol;
    });
  });

  const committedOrder = useRankGlide(
    () => {
      return listEl ?? null;
    },
    candidateOrder,
    { freeze: isFreeze },
  );

  const nameBySymbol = createMemo((): ReadonlyMap<string, string> => {
    return new Map(
      instruments().map((inst) => {
        return [inst.symbol, inst.name] as const;
      }),
    );
  });

  return (
    <Show
      when={instruments().length > 0}
      fallback={<div class={styles.empty}>NO INSTRUMENTS</div>}
    >
      <div
        class={styles.panel}
        ref={(el: HTMLDivElement): void => {
          listEl = el;
        }}
      >
        <For each={committedOrder()}>
          {(symbol: string): JSX.Element => {
            // Reactive per-item lookup (not a frozen `const`): a committed
            // symbol can briefly outlive its instrument (removed from the
            // watchlist while a glide was still in flight) — `<For>` doesn't
            // re-invoke this callback on a mere reorder/removal-while-buffered,
            // so the name must be tracked live via `createMemo`, not read once
            // at mount, for the row to disappear the instant it truly loses
            // its instrument (the next settled commit drops it for good).
            const name = createMemo((): string | undefined => {
              return nameBySymbol().get(symbol);
            });

            return (
              <Show when={name() !== undefined}>
                <WatchlistRow
                  symbol={symbol}
                  name={name() ?? ""}
                  selected={symbol === workspace.state().sel}
                  onSelect={workspace.select}
                  onQuote={reportQuote}
                />
              </Show>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

interface QuoteSnapshot {
  last: number;
  changePct: number;
}
