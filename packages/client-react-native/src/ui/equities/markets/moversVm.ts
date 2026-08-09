import type { EqWatchlistSort } from "@rtc/domain";

/** One row of the movers board, flattened from an instrument plus its latest
 * quote. `last`/`changePct` are null until the first quote for that symbol
 * arrives — the board renders rows immediately rather than waiting. */
export interface MoverRow {
  readonly symbol: string;
  readonly name: string;
  readonly last: number | null;
  readonly changePct: number | null;
}

export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

/** Order rows for the design's three RANK BY chips. Ported from web's
 * `sortWatchlistRows` rather than imported: `@rtc/client-react-native` may not
 * depend on `@rtc/client-react`. Returns a NEW array — callers keep the
 * caller's array intact so React keys stay stable across re-sorts.
 *
 * Rows with no quote yet always sort last: a null price is "unknown", not
 * "zero", and floating an unpriced row to the top of a movers board would
 * misread as a mover. */
export function sortMovers(
  rows: readonly MoverRow[],
  sort: EqWatchlistSort,
): readonly MoverRow[] {
  const copy = [...rows];

  if (sort === "sym") {
    return copy.sort((a, b) => {
      return a.symbol.localeCompare(b.symbol);
    });
  }

  const key = sort === "chg" ? "changePct" : "last";

  return copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];

    if (av === null && bv === null) {
      return 0;
    }
    if (av === null) {
      return 1;
    }
    if (bv === null) {
      return -1;
    }
    return bv - av;
  });
}

/** Project closes onto a width x height box in SCREEN coordinates (y grows
 * downward, so the highest close is at y = 0). A flat series has no range to
 * normalise against, so it sits on the midline instead of dividing by zero. */
export function sparklinePoints(
  closes: readonly number[],
  width: number,
  height: number,
): readonly SparklinePoint[] {
  if (closes.length < 2) {
    return [];
  }

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min;
  const step = width / (closes.length - 1);

  return closes.map((close, i) => {
    const ratio = range === 0 ? 0.5 : (close - min) / range;

    return { x: i * step, y: height - ratio * height };
  });
}
