import { type ReactElement, useEffect, useRef, useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./WatchlistRow.module.css";

/**
 * One watchlist row — symbol + name on the left, last + %-change on the
 * right (colored by the real `changePct` sign — `data-up` on `.last`/`.chg`).
 * `data-selected` reflects the shared eqWorkspace selection; a click selects
 * this row's symbol there.
 *
 * The transient tick pulse is diffed from the PREVIOUS tick's `last` in a ref
 * inside an effect (refs must never be READ during render, only in effects/
 * handlers) — subscribing to the external quote stream and calling setState
 * in response is the React-endorsed effect shape. Rather than a SECOND effect
 * clearing the flash (an anti-pattern: cascading renders with no external
 * sync), the pulse overlay is `key`ed on a monotonic tick counter: each
 * genuine tick remounts a fresh overlay element whose CSS `animation …
 * forwards` plays once and settles invisible — no timer, no clearing effect.
 */
export function WatchlistRow({
  symbol,
  name,
  selected,
  onSelect,
  onQuote,
}: WatchlistRowProps): ReactElement {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(symbol);
  const prevLastRef = useRef<number | undefined>(undefined);
  const [tick, setTick] = useState<TickPulse>({ nonce: 0, up: true });

  useEffect(() => {
    if (!quote) {
      return;
    }

    onQuote(symbol, quote.last, quote.changePct);

    const prev = prevLastRef.current;

    if (prev !== undefined && quote.last !== prev) {
      const isUp = quote.last > prev;
      setTick((t) => {
        return { nonce: t.nonce + 1, up: isUp };
      });
    }

    prevLastRef.current = quote.last;
  }, [quote, symbol, onQuote]);

  const changePct = quote?.changePct;
  const rowUp = (changePct ?? 0) >= 0;
  const last = quote?.last;
  const lastText = last !== undefined ? last.toFixed(2) : "—";
  const changeText =
    changePct !== undefined
      ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`
      : "—";

  return (
    <button
      type="button"
      data-testid={`watch-row-${symbol}`}
      data-watch-sym={symbol}
      data-selected={selected ? "true" : "false"}
      className={styles.row}
      onClick={() => {
        onSelect(symbol);
      }}
    >
      <span
        data-rank-glow="true"
        aria-hidden="true"
        className={styles.rankGlow}
      />
      {tick.nonce > 0 && (
        <span
          key={tick.nonce}
          data-testid={`watch-flash-${symbol}`}
          data-flash="true"
          data-up={tick.up ? "true" : "false"}
          className={styles.flashPulse}
          aria-hidden="true"
        />
      )}
      <span className={styles.left}>
        <span className={styles.sym}>{symbol}</span>
        <span className={styles.name}>{name}</span>
      </span>
      <span className={styles.right}>
        <span className={styles.last} data-up={rowUp ? "true" : "false"}>
          {lastText}
        </span>
        <span className={styles.chg} data-up={rowUp ? "true" : "false"}>
          {changeText}
        </span>
      </span>
    </button>
  );
}

export interface WatchlistRowProps {
  symbol: string;
  name: string;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onQuote: (symbol: string, last: number, changePct: number) => void;
}

interface TickPulse {
  nonce: number;
  up: boolean;
}
