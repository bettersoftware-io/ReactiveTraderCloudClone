import type { JSX } from "solid-js";
import { createMemo } from "solid-js";

import { Direction, type Price, PriceMovementType } from "@rtc/domain";

import { SpreadDisplay } from "./SpreadDisplay";

import styles from "./TilePrice.module.css";

export function TilePrice(props: TilePriceProps): JSX.Element {
  return (
    <div class={styles.row}>
      <PriceButton
        value={props.price.bid}
        ratePrecision={props.ratePrecision}
        pipsPosition={props.pipsPosition}
        movement={props.price.movementType}
        side="bid"
        anim={props.anim}
        onExecute={props.onExecute}
        disabled={props.disabled}
      />
      <SpreadDisplay spread={props.spread} />
      <PriceButton
        value={props.price.ask}
        ratePrecision={props.ratePrecision}
        pipsPosition={props.pipsPosition}
        movement={props.price.movementType}
        side="ask"
        anim={props.anim}
        onExecute={props.onExecute}
        disabled={props.disabled}
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

function PriceButton(props: PriceButtonProps): JSX.Element {
  const parts = createMemo((): PriceParts => {
    return splitPrice(props.value, props.ratePrecision, props.pipsPosition);
  });

  function handleClick(): void {
    props.onExecute(props.side === "bid" ? Direction.Sell : Direction.Buy);
  }

  return (
    <button
      type="button"
      data-testid={props.side === "bid" ? "sell-btn" : "buy-btn"}
      data-side={props.side}
      onClick={handleClick}
      disabled={props.disabled}
      class={styles.priceBox}
    >
      <span class={styles.boxLabel}>
        {props.side === "bid" ? "SELL" : "BUY"}
      </span>
      <span class={styles.value}>
        <span class={styles.big}>{parts().prefix}</span>
        <span
          data-testid="tile-pips"
          data-movement={movementKey(props.movement)}
          data-anim={props.anim}
          data-pips={parts().pips}
          class={styles.pips}
        >
          {parts().pips}
        </span>
        <span class={styles.frac}>{parts().fractional}</span>
      </span>
    </button>
  );
}
