import type { CSSProperties, ReactElement } from "react";

import type { DepthLevel } from "@rtc/domain";

import { useViewModel } from "#/ui/hooks/useViewModel";

import styles from "./DepthLadder.module.css";

interface DepthLadderProps {
  symbol: string;
}

interface DepthRowProps {
  level: DepthLevel;
  side: "bid" | "ask";
  depth: number; // size / maxSize, [0, 1]
}

function DepthRow({ level, side, depth }: DepthRowProps): ReactElement {
  return (
    <div
      data-side={side}
      className={styles.row}
      // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
      style={{ "--depth": depth } as CSSProperties}
    >
      <div className={styles.bar} />
      <span className={styles.price}>{level.price.toFixed(2)}</span>
      <span className={styles.size}>{level.size.toLocaleString()}</span>
    </div>
  );
}

export function DepthLadder({ symbol }: DepthLadderProps): ReactElement {
  const { useDepth } = useViewModel();
  const book = useDepth(symbol);

  if (!book) {
    return <div className={styles.empty}>NO DEPTH DATA</div>;
  }

  const allSizes = [
    ...book.bids.map((l) => {
      return l.size;
    }),
    ...book.asks.map((l) => {
      return l.size;
    }),
  ];
  const maxSize = Math.max(...allSizes, 1);

  // Show asks in reverse order (lowest ask at bottom, closest to mid)
  const asks = [...book.asks].slice(0, 8).reverse();
  const bids = book.bids.slice(0, 8);

  const bestAsk = book.asks[0]?.price ?? 0;
  const bestBid = book.bids[0]?.price ?? 0;
  const spread =
    bestAsk > 0 && bestBid > 0 ? (bestAsk - bestBid).toFixed(2) : "—";

  return (
    <div className={styles.ladder}>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>ASKS</div>
        {asks.map((level) => {
          return (
            <DepthRow
              key={`ask-${level.price}`}
              level={level}
              side="ask"
              depth={level.size / maxSize}
            />
          );
        })}
      </div>
      <div className={styles.spread}>SPREAD {spread}</div>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>BIDS</div>
        {bids.map((level) => {
          return (
            <DepthRow
              key={`bid-${level.price}`}
              level={level}
              side="bid"
              depth={level.size / maxSize}
            />
          );
        })}
      </div>
    </div>
  );
}
