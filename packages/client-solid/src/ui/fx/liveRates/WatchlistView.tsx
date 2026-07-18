import type { JSX } from "solid-js";
import { createMemo, For, onCleanup, Show } from "solid-js";

import {
  type CurrencyCategory,
  type CurrencyPair,
  PriceMovementType,
  type PriceTick,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

import { computeMovementPips } from "./movementPips";

import styles from "./WatchlistView.module.css";

/**
 * PROTO WatchlistView (dc.html watchlist arm): a compact table alternative
 * to the tile grid — one row per visible pair over a fixed 5-column grid
 * (Pair | Mid | Move | Spread | Trend). Reads the same per-pair streams
 * (usePrice/usePriceHistory) the tile grid's Tile.tsx does, so the two views
 * always agree on price/movement — only the layout differs.
 */
export function WatchlistView(props: WatchlistViewProps): JSX.Element {
  const { usePowerSaver } = useViewModel();
  const { isFreeze } = usePowerSaver();

  // Same isotope choreography as the tile grid (PROTO flips
  // '[data-tile-sym]' in BOTH the rates and watch views): surviving rows
  // glide, appearing rows slide in from the panel's right border,
  // filtered-out rows fall to its bottom border.
  const { register } = useFlipGrid(
    () => {
      return [props.filter];
    },
    { enter: true, exit: true, freeze: isFreeze },
  );

  return (
    <div data-testid="watchlist-view" class={styles.table}>
      <div class={styles.header}>
        <span>Pair</span>
        <span>Mid</span>
        <span>Move</span>
        <span>Spread</span>
        <span>Trend</span>
      </div>
      <For each={props.pairs}>
        {(pair: CurrencyPair) => {
          const setEl = register(pair.symbol);
          onCleanup(() => {
            setEl(null);
          });
          return <WatchlistRow pair={pair} rowRef={setEl} />;
        }}
      </For>
    </div>
  );
}

interface WatchlistViewProps {
  pairs: readonly CurrencyPair[];
  filter: CurrencyCategory;
}

const NO_VALUE = "—";

function WatchlistRow(props: WatchlistRowProps): JSX.Element {
  const { usePrice, usePriceHistory } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const price = usePrice(props.pair);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const history = usePriceHistory(props.pair.symbol);
  const movementPips = createMemo((): number | null => {
    return computeMovementPips(history(), props.pair.pipsPosition);
  });
  const sign = createMemo((): MovementSign => {
    return movementSign(price()?.movementType ?? PriceMovementType.NONE);
  });
  const midText = createMemo((): string => {
    const p = price();
    return p ? p.mid.toFixed(props.pair.ratePrecision) : NO_VALUE;
  });
  const moveText = createMemo((): string => {
    const pips = movementPips();
    return pips === null ? NO_VALUE : `${movementArrow(sign())} ${pips} pip`;
  });
  const spreadText = createMemo((): string => {
    const p = price();
    return p ? p.spread : NO_VALUE;
  });

  return (
    <div
      ref={props.rowRef}
      data-testid={`watch-row-${props.pair.symbol}`}
      class={styles.row}
    >
      <span class={styles.pair}>{props.pair.symbol}</span>
      <span data-testid="watch-mid" data-sign={sign()} class={styles.mid}>
        {midText()}
      </span>
      <span data-testid="watch-move" data-sign={sign()} class={styles.move}>
        {moveText()}
      </span>
      <span class={styles.spread}>{spreadText()}</span>
      <div class={styles.trend}>
        <Sparkline history={history()} sign={sign()} />
      </div>
    </div>
  );
}

interface WatchlistRowProps {
  pair: CurrencyPair;
  rowRef: (el: HTMLDivElement | null) => void;
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
function Sparkline(props: SparklineProps): JSX.Element {
  const points = createMemo((): string => {
    return buildTrendPoints(props.history);
  });

  return (
    <svg
      data-testid="watch-trend"
      viewBox={`0 0 ${TREND_VIEW_WIDTH} ${TREND_VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      width={TREND_VIEW_WIDTH}
      height={TREND_VIEW_HEIGHT}
      aria-hidden="true"
      class={styles.trendSvg}
    >
      <title>Recent mid-price trend</title>
      <Show when={points()}>
        <polyline
          points={points()}
          fill="none"
          stroke={
            props.sign === "down"
              ? "var(--accent-negative)"
              : "var(--accent-positive)"
          }
          stroke-width={1.4}
          stroke-linejoin="round"
        />
      </Show>
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
