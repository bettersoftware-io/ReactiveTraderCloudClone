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
 *
 * The optional trailing "open chart" affordance (`onOpenChart`, Phase 4 Task
 * 5) is a real `<button>` rendered as a SIBLING of the row's own `<button>`,
 * both wrapped in a `.rowWrapper` div — never a descendant of it. A `<button>`
 * cannot validly nest another `<button>` (invalid HTML; React's own DOM-
 * nesting validator warns on it), so nesting was never on the table, and a
 * non-button `role="button"` stand-in trips this repo's Biome
 * `useSemanticElements` rule (a real `<button>` genuinely is available here,
 * unlike that rule's two documented false-positive exceptions in
 * `biome.jsonc`). Being SIBLINGS rather than nested also means a click or
 * keyboard activation on the chart button can never bubble into the row's
 * own `onClick` in the first place — no `stopPropagation` needed, the
 * structure itself makes the two independent. The wrapper is rendered ONLY
 * when `onOpenChart` is defined — in-house (`undefined`) returns the row
 * `<button>` alone, byte-identical to the pre-Phase-4-Task-5 markup, so its
 * goldens are untouched. */
export function WatchlistRow({
  symbol,
  name,
  selected,
  onSelect,
  onQuote,
  onOpenChart,
  chartDisabled,
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

  function selectSymbol(): void {
    onSelect(symbol);
  }

  function openChart(): void {
    onOpenChart?.(symbol);
  }

  const rowButton = (
    <button
      type="button"
      data-testid={`watch-row-${symbol}`}
      data-watch-sym={symbol}
      data-selected={selected ? "true" : "false"}
      className={styles.row}
      onClick={selectSymbol}
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

  if (onOpenChart === undefined) {
    return rowButton;
  }

  return (
    <div className={styles.rowWrapper}>
      {rowButton}
      <button
        type="button"
        data-testid={`watch-open-chart-${symbol}`}
        className={styles.openChart}
        aria-label={`Open ${symbol} chart in a new panel`}
        title={`Open ${symbol} chart in a new panel`}
        disabled={chartDisabled}
        aria-disabled={chartDisabled}
        onClick={openChart}
      >
        📈
      </button>
    </div>
  );
}

export interface WatchlistRowProps {
  symbol: string;
  name: string;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onQuote: (symbol: string, last: number, changePct: number) => void;
  /** Opens a dynamically-opened chart instance for this row's symbol (Phase 4
   * Task 5). Optional slot, mirroring `PanelHeadControls.onPopout?` — the
   * panel attaches it only when the layout engine is dockview (the in-house
   * engine cannot show instances); undefined renders the row `<button>`
   * alone (no wrapper, no chart button at all), so in-house goldens stay
   * byte-identical. */
  onOpenChart?: (symbol: string) => void;
  /** True when this symbol already has an open instance, or the per-tab cap
   * (MAX_PANEL_INSTANCES) is reached — the button renders `aria-disabled`
   * and `disabled` (mirrors `PanelHeadControls`' pairing), so a click is a
   * genuine no-op. Ignored (no button at all) when `onOpenChart` is
   * undefined. */
  chartDisabled?: boolean;
}

interface TickPulse {
  nonce: number;
  up: boolean;
}
