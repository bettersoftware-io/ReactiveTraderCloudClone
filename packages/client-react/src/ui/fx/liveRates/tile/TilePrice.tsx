import type { ReactElement } from "react";

import { type Price, PriceMovementType } from "@rtc/domain";

import styles from "./TilePrice.module.css";

interface TilePriceProps {
  price: Price;
  ratePrecision: number;
  pipsPosition: number;
  anim?: "tickUp" | "tickDown";
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
  if (movement === PriceMovementType.UP) return "up";
  if (movement === PriceMovementType.DOWN) return "down";
  return "flat";
}

interface PriceButtonProps {
  label: string;
  value: number;
  ratePrecision: number;
  pipsPosition: number;
  movement: PriceMovementType;
  side: "bid" | "ask";
  anim?: "tickUp" | "tickDown";
}

function PriceButton({
  label,
  value,
  ratePrecision,
  pipsPosition,
  movement,
  side,
  anim,
}: PriceButtonProps): ReactElement {
  const { prefix, pips, fractional } = splitPrice(
    value,
    ratePrecision,
    pipsPosition,
  );

  return (
    <button type="button" className={styles.button} data-side={side}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className={styles.prefix}>{prefix}</span>
        <span
          data-testid="tile-pips"
          data-movement={movementKey(movement)}
          data-anim={anim}
          className={styles.pips}
        >
          {pips}
        </span>
        <span className={styles.fractional}>{fractional}</span>
      </span>
    </button>
  );
}

export function TilePrice({
  price,
  ratePrecision,
  pipsPosition,
  anim,
}: TilePriceProps): ReactElement {
  return (
    <div className={styles.row}>
      <PriceButton
        label="SELL"
        value={price.bid}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="bid"
        anim={anim}
      />
      <PriceButton
        label="BUY"
        value={price.ask}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="ask"
        anim={anim}
      />
    </div>
  );
}
