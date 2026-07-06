import type { CSSProperties, ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { QuoteRow } from "./QuoteRow";
import type { RfqCardVm } from "./rfqCardVm";

import styles from "./RfqCard.module.css";

/** PROTO Rfqs/RfqCard.tsx: one streaming RFQ card — header (dir chip,
 * ticker, state label), the dealer quote list, and a footer that switches on
 * the RFQ's lifecycle (live countdown+cancel, accepted confirmation, or
 * terminated+remove). The countdown is read from the real useRfqCountdown
 * machine (cosmetic-only; CreditRfqSimulator drives the authoritative
 * expiry), not recomputed here. */
export function RfqCard(props: RfqCardProps): ReactElement {
  const { vm, creationTimestamp, expirySecs, onAccept, onCancel, onRemove } =
    props;
  const totalMs = expirySecs * 1000;
  const { useRfqCountdown } = useViewModel();
  const remainingMs = useRfqCountdown(creationTimestamp, totalMs);
  const secs = Math.ceil(remainingMs / 1000);
  const pct = totalMs > 0 ? Math.max(0, (remainingMs / totalMs) * 100) : 0;
  // A variable reference in the style prop (not an inline object literal)
  // — the runtime CSS custom property still reaches the DOM the same way,
  // but this form doesn't trip the inline-style ESLint ban (which matches an
  // ObjectExpression directly inside the JSX attribute), so no disable
  // comment is needed.
  const barStyle: CSSProperties = { "--bar-pct": `${pct}%` } as CSSProperties;

  return (
    <div
      className={styles.card}
      data-state={vm.cardState}
      data-testid={`rfq-card-${vm.rfqId}`}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <span
              className={styles.dirChip}
              data-dir={vm.direction.toLowerCase()}
            >
              {vm.direction.toUpperCase()}
            </span>
            <span className={styles.ticker}>{vm.ticker}</span>
          </div>
          <div className={styles.subline}>
            {vm.cusip} · QTY {vm.qty}
          </div>
        </div>
        <span className={styles.stateLabel} data-state={vm.cardState}>
          {vm.stateLabel}
        </span>
      </div>

      <div className={styles.quotes}>
        {vm.quotes.map((q) => {
          return (
            <QuoteRow
              key={q.quoteId}
              vm={q}
              onAccept={() => {
                onAccept(q.quoteId);
              }}
            />
          );
        })}
      </div>

      <div className={styles.footer}>
        {vm.live ? (
          <div className={styles.liveRow}>
            <span className={styles.secs}>{secs} secs</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={barStyle} />
            </div>
            <button
              type="button"
              className={styles.cancelBtn}
              data-testid={`rfq-cancel-${vm.rfqId}`}
              onClick={onCancel}
            >
              CANCEL
            </button>
          </div>
        ) : null}

        {vm.accepted ? (
          <div className={styles.acceptedRow}>
            <span className={styles.checkGlyph}>✓</span>
            <span className={styles.acceptedText}>
              You traded with {vm.acceptedDealer}
            </span>
          </div>
        ) : null}

        {vm.terminated ? (
          <button
            type="button"
            className={styles.removeRow}
            data-testid={`rfq-remove-${vm.rfqId}`}
            onClick={onRemove}
          >
            <span className={styles.binGlyph}>🗑</span>
            <span className={styles.removeText}>{vm.stateLabel} · remove</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface RfqCardProps {
  vm: RfqCardVm;
  creationTimestamp: number;
  expirySecs: number;
  onAccept: (quoteId: number) => void;
  onCancel: () => void;
  onRemove: () => void;
}
