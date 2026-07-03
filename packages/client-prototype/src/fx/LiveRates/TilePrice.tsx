import type { CSSProperties, ReactElement } from "react";

import { splitPrice } from "#/fx/fxData";
import styles from "#/fx/LiveRates/TilePrice.module.css";
import type { PairMeta } from "#/fx/types";

export interface TilePriceProps {
  side: "Sell" | "Buy";
  rate: number;
  meta: PairMeta;
  moveUp: boolean;
  flashOn: boolean;
  flashUp: boolean;
  isRfq: boolean;
}

export function TilePrice(props: TilePriceProps): ReactElement {
  const { side, rate, meta, moveUp, flashOn, flashUp, isRfq } = props;
  const sideAttr = side === "Sell" ? "sell" : "buy";
  const pu = meta.d === 3 ? 0.01 : 0.0001;
  const half = (parseFloat(meta.spread) / 2) * pu;
  const price = side === "Sell" ? rate - half : rate + half;
  const split = splitPrice(price, meta);
  // PROTO 1268/1281: the pips span carries two independent colors — the
  // daily-move color at rest (`--move-color`) and the triggering tick's own
  // direction for the flash background (`--flash-color`).
  const moveColor = {
    "--move-color": moveUp ? "var(--buy)" : "var(--sell)",
    "--flash-color": flashUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <>
      <div className={styles.labelRow}>
        {side === "Sell" ? (
          <span className={styles.sideLabel} data-side="sell">
            SELL
          </span>
        ) : null}
        {isRfq ? <span className={styles.rfqBadge}>RFQ</span> : null}
        {side === "Buy" ? (
          <span className={styles.sideLabel} data-side="buy">
            BUY
          </span>
        ) : null}
      </div>
      <div className={styles.priceRow} data-side={sideAttr}>
        <span className={styles.big}>{split.big}</span>
        <span
          className={styles.pips}
          data-flash={String(flashOn)}
          style={moveColor}
        >
          {split.pips}
        </span>
        <span className={styles.frac}>{split.frac}</span>
      </div>
    </>
  );
}
