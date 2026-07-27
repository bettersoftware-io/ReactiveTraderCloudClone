import type { ReactElement } from "react";

import type { JarvisConfirmation } from "@rtc/client-core";
import { Direction } from "@rtc/domain";
import { ringCircumference, ringDashOffset } from "@rtc/motion-core";

import styles from "./JarvisConfirmCard.module.css";

/**
 * Props-only dumb card rendered by JarvisOverlay while
 * `state.pendingConfirmation` is set — pair/direction/notional/price plus an
 * SVG countdown ring. The ring's `remainingFraction` comes from the machine
 * (ticking once per second server-side of the UI, JarvisMachine), so no UI
 * timer is involved: the `stroke-dashoffset` is set directly as an SVG
 * attribute (not an inline style — attributes sidestep the inline-style
 * lint ban entirely) and a plain CSS transition smooths between the
 * once-a-second state updates.
 */
export function JarvisConfirmCard({
  confirmation,
  onApprove,
  onReject,
}: JarvisConfirmCardProps): ReactElement {
  const circumference = ringCircumference(RING_RADIUS);
  const dashOffset = ringDashOffset(
    RING_RADIUS,
    confirmation.remainingFraction,
  );
  const dir = confirmation.direction === Direction.Buy ? "buy" : "sell";

  return (
    <div data-testid="jarvis-confirm-card" className={styles.card}>
      <svg
        className={styles.ring}
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden="true"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          className={styles.ringTrack}
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          className={styles.ringFill}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>

      <div className={styles.body}>
        <div className={styles.headline}>
          <span data-dir={dir} className={styles.dirBadge}>
            {dir === "buy" ? "BUY" : "SELL"}
          </span>
          <span className={styles.symbol}>{confirmation.symbol}</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>NOTIONAL</span>
          <span className={styles.detailValue}>
            {formatNotional(confirmation.notional)}
          </span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>QUOTE</span>
          <span className={styles.detailValue}>
            {formatPrice(confirmation.quotedPrice, confirmation.ratePrecision)}
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            data-testid="jarvis-confirm-approve"
            className={styles.approveButton}
            onClick={onApprove}
          >
            APPROVE
          </button>
          <button
            type="button"
            data-testid="jarvis-confirm-reject"
            className={styles.rejectButton}
            onClick={onReject}
          >
            REJECT
          </button>
        </div>
      </div>
    </div>
  );
}

export interface JarvisConfirmCardProps {
  confirmation: JarvisConfirmation;
  onApprove: () => void;
  onReject: () => void;
}

const RING_SIZE = 48;
const RING_RADIUS = 20;
const RING_STROKE = 4;

function formatNotional(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Same convention as the price tiles: toFixed(CurrencyPair.ratePrecision) —
 * toPrecision(6) used to pad low-precision (JPY-style) pairs with trailing
 * zeros beyond their 3-decimal display convention. */
function formatPrice(price: number, ratePrecision: number): string {
  return price.toFixed(ratePrecision);
}
