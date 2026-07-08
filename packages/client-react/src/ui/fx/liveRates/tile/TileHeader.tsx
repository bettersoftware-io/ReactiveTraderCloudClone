import type { ReactElement } from "react";

import { PriceMovementType } from "@rtc/domain";

import styles from "./TileHeader.module.css";

export function TileHeader({
  base,
  terms,
  symbol,
  movement,
  movementPips,
  onInitiateRfq,
}: TileHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      <div className={styles.symbolCode}>{symbol}</div>
      <div className={styles.pairRow}>
        <span className={styles.pairName}>
          <span>{base}</span>
          <span className={styles.separator}>/</span>
          <span>{terms}</span>
        </span>
        <span className={styles.headerActions}>
          {onInitiateRfq ? (
            <button
              type="button"
              data-testid="rfq-initiate"
              title="Initiate RFQ"
              aria-label="Initiate RFQ"
              className={styles.rfqChip}
              onClick={onInitiateRfq}
            >
              ⚡ RFQ
            </button>
          ) : null}
          {movementPips !== null && (
            <span
              data-movement={movementKey(movement)}
              className={styles.movementBadge}
            >
              {movementArrow(movement)} {movementPips} pip
            </span>
          )}
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
  if (movement === PriceMovementType.UP) return "up";
  if (movement === PriceMovementType.DOWN) return "down";
  return "flat";
}

function movementArrow(movement: PriceMovementType): string {
  if (movement === PriceMovementType.UP) return "▲";
  if (movement === PriceMovementType.DOWN) return "▼";
  return "–";
}
