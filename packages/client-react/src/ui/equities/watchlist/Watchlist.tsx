import type { CSSProperties, ReactElement } from "react";

import type { EquityInstrument } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./Watchlist.module.css";

interface WatchlistProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface WatchlistRowProps {
  instrument: EquityInstrument;
  active: boolean;
  onSelect: (symbol: string) => void;
}

/**
 * Per-symbol row — separated into its own component so the hook call to
 * `useEquityQuote(symbol)` is valid at the top level of a function component.
 */
function WatchlistRow({
  instrument,
  active,
  onSelect,
}: WatchlistRowProps): ReactElement {
  const { useEquityQuote } = useHooks();
  const quote = useEquityQuote(instrument.symbol);

  const changePct = quote?.changePct ?? 0;
  const direction = changePct >= 0 ? "up" : "down";
  // Clamp heat to [0, 1]: 10% move = full heat
  const heat = Math.min(1, Math.abs(changePct) / 10);
  const last = quote?.last.toFixed(2) ?? "—";
  const change = quote
    ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`
    : "—";
  const spread = quote ? (quote.ask - quote.bid).toFixed(2) : "—";

  return (
    <button
      type="button"
      data-testid={`watchlist-row-${instrument.symbol}`}
      data-direction={direction}
      data-active={active ? "true" : "false"}
      className={styles.row}
      style={{ "--heat": heat } as CSSProperties}
      onClick={() => {
        onSelect(instrument.symbol);
      }}
    >
      <span className={styles.symbol}>{instrument.symbol}</span>
      <span className={styles.last}>{last}</span>
      <span className={styles.change}>{change}</span>
      <span className={styles.spread}>{spread}</span>
    </button>
  );
}

export function Watchlist({
  selectedSymbol,
  onSelect,
}: WatchlistProps): ReactElement {
  const { useWatchlist } = useHooks();
  const instruments = useWatchlist();

  if (instruments.length === 0) {
    return <div className={styles.empty}>NO INSTRUMENTS</div>;
  }

  return (
    <div className={styles.watchlist}>
      <div className={styles.header}>
        <span>SYMBOL</span>
        <span>LAST</span>
        <span>CHG%</span>
        <span>SPRD</span>
      </div>
      {instruments.map((inst) => {
        return (
          <WatchlistRow
            key={inst.symbol}
            instrument={inst}
            active={inst.symbol === selectedSymbol}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
