export interface PriceTick {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
  readonly valueDate: string;
  readonly creationTimestamp: number;
}

export enum PriceMovementType {
  NONE = "NONE",
  UP = "UP",
  DOWN = "DOWN",
}

export interface Price extends PriceTick {
  readonly movementType: PriceMovementType;
  readonly spread: string;
}

/**
 * Spread = (ask - bid) * 10^pipsPosition, formatted to (ratePrecision - pipsPosition) decimal places.
 */
export function calculateSpread(
  bid: number,
  ask: number,
  pipsPosition: number,
  ratePrecision: number,
): string {
  const raw = (ask - bid) * 10 ** pipsPosition;
  const decimalPlaces = ratePrecision - pipsPosition;
  return raw.toFixed(decimalPlaces);
}

/**
 * First tick = NONE. Subsequent: mid > prev = UP, mid <= prev = DOWN.
 */
export function detectMovement(
  currentMid: number,
  previousMid: number | undefined,
): PriceMovementType {
  if (previousMid === undefined) return PriceMovementType.NONE;
  return currentMid > previousMid
    ? PriceMovementType.UP
    : PriceMovementType.DOWN;
}

export const PRICE_HISTORY_SIZE = 50;
