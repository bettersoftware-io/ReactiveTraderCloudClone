import type { PriceTick } from "@rtc/domain";

/**
 * Pip movement between the two most recent history ticks, scaled by the
 * pair's pip position. Shared by Tile.tsx's header badge and
 * WatchlistView.tsx's Move cell — the same math, so both views always
 * agree on the magnitude for a given pair. Null (badge/cell hidden) until
 * two ticks exist — the magnitude is unknown then, not zero, and the
 * price's movementType may already be non-flat.
 */
export function computeMovementPips(
  history: readonly PriceTick[],
  pipsPosition: number,
): number | null {
  if (history.length < 2) {
    return null;
  }

  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  return Math.round(Math.abs(last.mid - prev.mid) * 10 ** pipsPosition);
}
