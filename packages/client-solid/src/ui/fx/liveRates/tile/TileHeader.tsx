import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { PriceMovementType } from "@rtc/domain";

import styles from "./TileHeader.module.css";

export function TileHeader(props: TileHeaderProps): JSX.Element {
  return (
    <div class={styles.header}>
      <div class={styles.symbolCode}>{props.symbol}</div>
      <div class={styles.pairRow}>
        <span class={styles.pairName}>
          <span>{props.base}</span>
          <span class={styles.separator}>/</span>
          <span>{props.terms}</span>
        </span>
        <span class={styles.headerActions}>
          <Show when={props.onInitiateRfq}>
            <button
              type="button"
              data-testid="rfq-initiate"
              title="Initiate RFQ"
              aria-label="Initiate RFQ"
              class={styles.rfqChip}
              onClick={props.onInitiateRfq}
            >
              ⚡ RFQ
            </button>
          </Show>
          <Show when={props.movementPips !== null}>
            <span
              data-movement={movementKey(props.movement)}
              class={styles.movementBadge}
            >
              {movementArrow(props.movement)} {props.movementPips} pip
            </span>
          </Show>
        </span>
      </div>
    </div>
  );
}

interface TileHeaderProps {
  base: string;
  terms: string;
  symbol: string;
  movement: PriceMovementType;
  /** Pip magnitude of the last tick, or null (no badge) before two ticks. */
  movementPips: number | null;
  /** When set, renders the compact ⚡ RFQ chip on the row's right side (the
   * RFQ init-state affordance — styled like the CHARTS head-chip so it fits
   * an existing row and never changes the tile's height). */
  onInitiateRfq?: () => void;
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

function movementArrow(movement: PriceMovementType): string {
  if (movement === PriceMovementType.UP) {
    return "▲";
  }

  if (movement === PriceMovementType.DOWN) {
    return "▼";
  }

  return "–";
}
