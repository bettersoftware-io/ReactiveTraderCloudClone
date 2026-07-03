import type { ReactElement } from "react";

import { PriceMovementType } from "@rtc/domain";

import styles from "./TileHeader.module.css";

export function TileHeader({
  base,
  terms,
  symbol,
  movement,
  movementPips,
}: TileHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      <div className={styles.symbolCode}>{symbol}</div>
      <div className={styles.pairRow}>
        <span>{base}</span>
        <span className={styles.separator}>/</span>
        <span>{terms}</span>
        {movementPips !== null && (
          <span
            data-movement={movementKey(movement)}
            className={styles.movementBadge}
          >
            {movementArrow(movement)} {movementPips} pip
          </span>
        )}
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
}

function movementKey(movement: PriceMovementType): "up" | "down" | "flat" {
  if (movement === PriceMovementType.UP) return "up";
  if (movement === PriceMovementType.DOWN) return "down";
  return "flat";
}

function movementArrow(movement: PriceMovementType): string {
  if (movement === PriceMovementType.UP) return "▲";
  if (movement === PriceMovementType.DOWN) return "▼";
  return "–";
}
