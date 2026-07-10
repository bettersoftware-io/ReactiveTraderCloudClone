import type { ReactElement } from "react";

import {
  type CurrencyPair,
  PriceMovementType,
  type PriceTick,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { computeMovementPips } from "./movementPips";

import styles from "./WatchlistView.module.css";

/**
 * PROTO WatchlistView (dc.html watchlist arm): a compact table alternative
 * to the tile grid — one row per visible pair over a fixed 5-column grid
 * (Pair | Mid | Move | Spread | Trend). Reads the same per-pair streams
 * (usePrice/usePriceHistory) the tile grid's Tile.tsx does, so the two views
 * always agree on price/movement — only the layout differs.
 */
export function WatchlistView({ pairs }: WatchlistViewProps): ReactElement {
  return (
    <div data-testid="watchlist-view" className={styles.table}>
      <div className={styles.header}>
        <span>Pair</span>
        <span>Mid</span>
        <span>Move</span>
        <span>Spread</span>
        <span>Trend</span>
      </div>
      {pairs.map((pair) => {
        return <WatchlistRow key={pair.symbol} pair={pair} />;
      })}
    </div>
  );
}

interface WatchlistViewProps {
  pairs: readonly CurrencyPair[];
}

const NO_VALUE = "—";

function WatchlistRow({ pair }: WatchlistRowProps): ReactElement {
  const { usePrice, usePriceHistory } = useViewModel();
  const price = usePrice(pair);
  const history = usePriceHistory(pair.symbol);
  const movementPips = computeMovementPips(history, pair.pipsPosition);
  const sign = movementSign(price?.movementType ?? PriceMovementType.NONE);
  const midText = price ? price.mid.toFixed(pair.ratePrecision) : NO_VALUE;
  const moveText =
    movementPips === null
      ? NO_VALUE
      : `${movementArrow(sign)} ${movementPips} pip`;
  const spreadText = price ? price.spread : NO_VALUE;

  return (
    <div data-testid={`watch-row-${pair.symbol}`} className={styles.row}>
      <span className={styles.pair}>{pair.symbol}</span>
      <span data-testid="watch-mid" data-sign={sign} className={styles.mid}>
        {midText}
      </span>
      <span data-testid="watch-move" data-sign={sign} className={styles.move}>
        {moveText}
      </span>
      <span className={styles.spread}>{spreadText}</span>
      <div className={styles.trend}>
        <Sparkline history={history} sign={sign} />
      </div>
    </div>
  );
}

interface WatchlistRowProps {
  pair: CurrencyPair;
}

type MovementSign = "up" | "down" | "flat";

function movementSign(movement: PriceMovementType): MovementSign {
  if (movement === PriceMovementType.UP) {
    return "up";
  }

  if (movement === PriceMovementType.DOWN) {
    return "down";
  }

  return "flat";
}

function movementArrow(sign: MovementSign): string {
  if (sign === "up") {
    return "▲";
  }

  if (sign === "down") {
    return "▼";
  }

  return "–";
}

interface SparklineProps {
  history: readonly PriceTick[];
  sign: MovementSign;
}

const TREND_VIEW_WIDTH = 60;
const TREND_VIEW_HEIGHT = 18;
const TREND_POINTS_SHOWN = 12;

/** Mini inline trend sparkline — a smaller sibling of TileChart, sized for
 * the Trend column rather than a tile's full width. Colored by the same
 * `sign` driving this row's Mid/Move cells, so all three cells read as one
 * consistent direction. */
function Sparkline({ history, sign }: SparklineProps): ReactElement {
  const points = buildTrendPoints(history);

  return (
    <svg
      data-testid="watch-trend"
      viewBox={`0 0 ${TREND_VIEW_WIDTH} ${TREND_VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      width={TREND_VIEW_WIDTH}
      height={TREND_VIEW_HEIGHT}
      aria-hidden="true"
      className={styles.trendSvg}
    >
      <title>Recent mid-price trend</title>
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke={
            sign === "down"
              ? "var(--accent-negative)"
              : "var(--accent-positive)"
          }
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function buildTrendPoints(history: readonly PriceTick[]): string {
  const shown = history.slice(-TREND_POINTS_SHOWN);

  if (shown.length < 2) {
    return "";
  }

  // Normalize over the FULL history buffer (like the prototype's histRange
  // and TileChart's buildPath), then plot only the sliced last-12 ticks —
  // so the trend's vertical scale is stable across ticks, not rescaled to
  // whatever the visible window happens to contain.
  const allMids = history.map((tick) => {
    return tick.mid;
  });
  const min = Math.min(...allMids);
  const max = Math.max(...allMids);
  const range = max - min || 1;

  const shownMids = shown.map((tick) => {
    return tick.mid;
  });
  const step = TREND_VIEW_WIDTH / (shownMids.length - 1);

  return shownMids
    .map((mid, i) => {
      const x = i * step;
      const y = TREND_VIEW_HEIGHT - ((mid - min) / range) * TREND_VIEW_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
