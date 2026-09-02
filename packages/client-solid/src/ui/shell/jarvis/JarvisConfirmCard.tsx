import type { JSX } from "solid-js";

import type { JarvisConfirmation } from "@rtc/client-core";
import { Direction } from "@rtc/domain";
import { ringCircumference, ringDashOffset } from "@rtc/motion-core";

import styles from "./JarvisConfirmCard.module.css";

/**
 * Props-only dumb card rendered by JarvisOverlay while
 * `state().pendingConfirmation` is set — pair/direction/notional/price plus an
 * SVG countdown ring. The ring's `remainingFraction` comes from the machine
 * (ticking once per second server-side of the UI, JarvisMachine), so no UI
 * timer is involved: the `stroke-dashoffset` is set directly as an SVG
 * attribute (not an inline style — attributes sidestep the inline-style
 * lint ban entirely) and a plain CSS transition smooths between the
 * once-a-second state updates.
 */
export function JarvisConfirmCard(props: JarvisConfirmCardProps): JSX.Element {
  function circumference(): string {
    return String(ringCircumference(RING_RADIUS));
  }

  function dashOffset(): string {
    return String(
      ringDashOffset(RING_RADIUS, props.confirmation.remainingFraction),
    );
  }

  function dir(): "buy" | "sell" {
    return props.confirmation.direction === Direction.Buy ? "buy" : "sell";
  }

  function approveConfirmation(): void {
    props.onApprove();
  }

  function rejectConfirmation(): void {
    props.onReject();
  }

  return (
    <div data-testid="jarvis-confirm-card" class={styles.card}>
      <svg
        class={styles.ring}
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
          class={styles.ringTrack}
          stroke-width={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          class={styles.ringFill}
          stroke-width={RING_STROKE}
          stroke-linecap="round"
          stroke-dasharray={circumference()}
          stroke-dashoffset={dashOffset()}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>

      <div class={styles.body}>
        <div class={styles.headline}>
          <span data-dir={dir()} class={styles.dirBadge}>
            {dir() === "buy" ? "BUY" : "SELL"}
          </span>
          <span class={styles.symbol}>{props.confirmation.symbol}</span>
        </div>
        <div class={styles.detailRow}>
          <span class={styles.detailLabel}>NOTIONAL</span>
          <span class={styles.detailValue}>
            {formatNotional(props.confirmation.notional)}
          </span>
        </div>
        <div class={styles.detailRow}>
          <span class={styles.detailLabel}>QUOTE</span>
          <span class={styles.detailValue}>
            {formatPrice(
              props.confirmation.quotedPrice,
              props.confirmation.ratePrecision,
            )}
          </span>
        </div>

        <div class={styles.actions}>
          <button
            type="button"
            data-testid="jarvis-confirm-approve"
            class={styles.approveButton}
            onClick={approveConfirmation}
          >
            APPROVE
          </button>
          <button
            type="button"
            data-testid="jarvis-confirm-reject"
            class={styles.rejectButton}
            onClick={rejectConfirmation}
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
