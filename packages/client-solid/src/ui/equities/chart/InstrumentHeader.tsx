import { createMemo, type JSX } from "solid-js";

import type { Candle, EquityQuote } from "@rtc/domain";

import styles from "./InstrumentHeader.module.css";

/**
 * Live instrument header: symbol/name lede, the big flash-coloured last
 * price with abs+pct change, and the BID/ASK/DAY RANGE/VOL stat strip.
 * Purely presentational — the tick-flash detection (data-flash/data-dir)
 * and the useEquityQuote/useCandles reads live in ChartPanel, which feeds
 * the same flashOn into the candle plot's last-bar glow (PROTO's single
 * fl/flashOn computed once in EquitiesScreen and threaded to both).
 */
export function InstrumentHeader(props: InstrumentHeaderProps): JSX.Element {
  const last = createMemo((): number | null => {
    return props.quote?.last ?? null;
  });

  const changePct = createMemo((): number | null => {
    return props.quote?.changePct ?? null;
  });

  const up = createMemo((): boolean => {
    return (changePct() ?? 0) >= 0;
  });

  const chgAbs = createMemo((): number | null => {
    const l = last();
    const c = changePct();
    return l !== null && c !== null ? changeAbsFromPct(l, c) : null;
  });

  const dayRange = createMemo((): DayRange | null => {
    return computeDayRange(props.candles, last());
  });

  return (
    <div class={styles.header} data-testid="instrument-header">
      <div class={styles.idBlock}>
        <div class={styles.sym}>{props.symbol}</div>
        <div class={styles.name}>
          {props.instrumentName && props.exchange
            ? `${props.instrumentName} · ${props.exchange}`
            : "—"}
        </div>
      </div>
      <div class={styles.priceBlock}>
        <div
          class={styles.last}
          data-testid="instrument-header-last"
          data-flash={String(props.flashOn)}
          data-dir={props.flashDir}
        >
          {last() !== null ? (last() as number).toFixed(2) : "—"}
        </div>
        <div
          class={styles.change}
          data-testid="instrument-header-change"
          data-up={String(up())}
        >
          {chgAbs() !== null && changePct() !== null
            ? `${up() ? "+" : ""}${(chgAbs() as number).toFixed(2)} (${up() ? "+" : ""}${(changePct() as number).toFixed(2)}%)`
            : "—"}
        </div>
      </div>
      <div class={styles.spacer} />
      <div class={styles.stats}>
        <Stat
          testId="instrument-header-bid"
          label="BID"
          value={props.quote ? props.quote.bid.toFixed(2) : "—"}
          tone="sell"
        />
        <Stat
          testId="instrument-header-ask"
          label="ASK"
          value={props.quote ? props.quote.ask.toFixed(2) : "—"}
          tone="buy"
        />
        <Stat
          testId="instrument-header-range"
          label="DAY RANGE"
          value={
            dayRange()
              ? `${(dayRange() as DayRange).low.toFixed(2)} – ${(dayRange() as DayRange).high.toFixed(2)}`
              : "—"
          }
          tone="text"
        />
        <Stat
          testId="instrument-header-vol"
          label="VOL"
          value={estimateVolume(props.candles)}
          tone="text"
        />
      </div>
    </div>
  );
}

const VOL_BASE_M = 2.4;
const VOL_RANGE_M = 0.2;

export interface InstrumentHeaderProps {
  symbol: string;
  instrumentName?: string;
  exchange?: string;
  quote: EquityQuote | null;
  candles: readonly Candle[];
  flashOn: boolean;
  flashDir: "up" | "down";
}

interface StatProps {
  testId: string;
  label: string;
  value: string;
  tone: "buy" | "sell" | "text";
}

function Stat(props: StatProps): JSX.Element {
  return (
    <div class={styles.stat}>
      <div class={styles.statLabel}>{props.label}</div>
      <div
        class={styles.statValue}
        data-testid={props.testId}
        data-tone={props.tone}
      >
        {props.value}
      </div>
    </div>
  );
}

/** last = prev * (1 + changePct/100) ⇒ prev = last / (1 + changePct/100);
 * the abs change is last - prev. Recovers the abs change from the domain
 * quote's changePct without needing a stored `prev` field. */
function changeAbsFromPct(last: number, changePct: number): number {
  const prev = last / (1 + changePct / 100);
  return last - prev;
}

interface DayRange {
  low: number;
  high: number;
}

/** Day range = the candle series' min/max, stretched to include the live
 * last price (mirrors chartVm's live-last overlay). */
function computeDayRange(
  candles: readonly Candle[],
  last: number | null,
): DayRange | null {
  const highs = candles.map((c) => {
    return c.high;
  });

  const lows = candles.map((c) => {
    return c.low;
  });

  if (last !== null) {
    highs.push(last);
    lows.push(last);
  }

  if (highs.length === 0) {
    return null;
  }

  return { low: Math.min(...lows), high: Math.max(...highs) };
}

/**
 * Deterministic stand-in for the prototype's `(2.4 + rng()*0.2)M`, which
 * recomputed with Math.random() on every render. Folds the candle series'
 * mean high-low range into a stable [0, 1) jitter instead of an RNG, so the
 * same series always yields the same VOL string.
 */
function estimateVolume(candles: readonly Candle[]): string {
  if (candles.length === 0) {
    return `${VOL_BASE_M.toFixed(1)}M`;
  }

  const meanRange =
    candles.reduce((sum, c) => {
      return sum + (c.high - c.low);
    }, 0) / candles.length;
  const jitter = meanRange - Math.floor(meanRange);

  return `${(VOL_BASE_M + jitter * VOL_RANGE_M).toFixed(1)}M`;
}
