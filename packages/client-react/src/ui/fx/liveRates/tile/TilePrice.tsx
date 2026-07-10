import type { ReactElement } from "react";

import { Direction, type Price, PriceMovementType } from "@rtc/domain";

import { SpreadDisplay } from "./SpreadDisplay";

import styles from "./TilePrice.module.css";

export function TilePrice({
  price,
  ratePrecision,
  pipsPosition,
  anim,
  spread,
  onExecute,
  disabled,
}: TilePriceProps): ReactElement {
  return (
    <div className={styles.row}>
      <PriceButton
        value={price.bid}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="bid"
        anim={anim}
        onExecute={onExecute}
        disabled={disabled}
      />
      <SpreadDisplay spread={spread} />
      <PriceButton
        value={price.ask}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="ask"
        anim={anim}
        onExecute={onExecute}
        disabled={disabled}
      />
    </div>
  );
}

interface TilePriceProps {
  price: Price;
  ratePrecision: number;
  pipsPosition: number;
  anim?: "tickUp" | "tickDown";
  spread: string;
  onExecute: (direction: Direction) => void;
  disabled: boolean;
}

interface PriceParts {
  prefix: string;
  pips: string;
  fractional: string;
}

/**
 * Splits a formatted price into parts for big/pip/fractional display.
 * For EURUSD 1.53816 (pipsPosition=4, ratePrecision=5):
 *   prefix="1.53", pips="81", fractional="6"
 */
function splitPrice(
  value: number,
  ratePrecision: number,
  pipsPosition: number,
): PriceParts {
  const formatted = value.toFixed(ratePrecision);
  const fractionalDigits = ratePrecision - pipsPosition;
  const pipEnd = formatted.length - fractionalDigits;
  const pipStart = pipEnd - 2;

  return {
    prefix: formatted.slice(0, pipStart),
    pips: formatted.slice(pipStart, pipEnd),
    fractional: fractionalDigits > 0 ? formatted.slice(pipEnd) : "",
  };
}

function movementKey(movement: PriceMovementType): "up" | "down" | "flat" {
  if (movement === PriceMovementType.UP) {
    return "up";
  }

  if (movement === PriceMovementType.DOWN) {
    return "down";
  }

  return "flat";
}

interface PriceButtonProps {
  value: number;
  ratePrecision: number;
  pipsPosition: number;
  movement: PriceMovementType;
  side: "bid" | "ask";
  anim?: "tickUp" | "tickDown";
  onExecute: (direction: Direction) => void;
  disabled: boolean;
}

function PriceButton({
  value,
  ratePrecision,
  pipsPosition,
  movement,
  side,
  anim,
  onExecute,
  disabled,
}: PriceButtonProps): ReactElement {
  const { prefix, pips, fractional } = splitPrice(
    value,
    ratePrecision,
    pipsPosition,
  );

  function handleClick(): void {
    onExecute(side === "bid" ? Direction.Sell : Direction.Buy);
  }

  return (
    <button
      type="button"
      data-testid={side === "bid" ? "sell-btn" : "buy-btn"}
      data-side={side}
      onClick={handleClick}
      disabled={disabled}
      className={styles.priceBox}
    >
      <span className={styles.boxLabel}>{side === "bid" ? "SELL" : "BUY"}</span>
      <span className={styles.value}>
        <span className={styles.big}>{prefix}</span>
        <span
          data-testid="tile-pips"
          data-movement={movementKey(movement)}
          data-anim={anim}
          data-pips={pips}
          className={styles.pips}
        >
          {pips}
        </span>
        <span className={styles.frac}>{fractional}</span>
      </span>
    </button>
  );
}
