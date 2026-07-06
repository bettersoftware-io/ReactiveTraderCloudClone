import type { ReactElement } from "react";

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
export function InstrumentHeader({
  symbol,
  instrumentName,
  exchange,
  quote,
  candles,
  flashOn,
  flashDir,
}: InstrumentHeaderProps): ReactElement {
  const last = quote?.last ?? null;
  const changePct = quote?.changePct ?? null;
  const up = (changePct ?? 0) >= 0;
  const chgAbs =
    last !== null && changePct !== null
      ? changeAbsFromPct(last, changePct)
      : null;
  const dayRange = computeDayRange(candles, last);

  return (
    <div className={styles.header} data-testid="instrument-header">
      <div className={styles.idBlock}>
        <div className={styles.sym}>{symbol}</div>
        <div className={styles.name}>
          {instrumentName && exchange ? `${instrumentName} · ${exchange}` : "—"}
        </div>
      </div>
      <div className={styles.priceBlock}>
        <div
          className={styles.last}
          data-testid="instrument-header-last"
          data-flash={String(flashOn)}
          data-dir={flashDir}
        >
          {last !== null ? last.toFixed(2) : "—"}
        </div>
        <div
          className={styles.change}
          data-testid="instrument-header-change"
          data-up={String(up)}
        >
          {chgAbs !== null && changePct !== null
            ? `${up ? "+" : ""}${chgAbs.toFixed(2)} (${up ? "+" : ""}${changePct.toFixed(2)}%)`
            : "—"}
        </div>
      </div>
      <div className={styles.spacer} />
      <div className={styles.stats}>
        <Stat
          testId="instrument-header-bid"
          label="BID"
          value={quote ? quote.bid.toFixed(2) : "—"}
          tone="sell"
        />
        <Stat
          testId="instrument-header-ask"
          label="ASK"
          value={quote ? quote.ask.toFixed(2) : "—"}
          tone="buy"
        />
        <Stat
          testId="instrument-header-range"
          label="DAY RANGE"
          value={
            dayRange
              ? `${dayRange.low.toFixed(2)} – ${dayRange.high.toFixed(2)}`
              : "—"
          }
          tone="text"
        />
        <Stat
          testId="instrument-header-vol"
          label="VOL"
          value={estimateVolume(candles)}
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

function Stat({ testId, label, value, tone }: StatProps): ReactElement {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} data-testid={testId} data-tone={tone}>
        {value}
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
