import type { CSSProperties, ReactElement } from "react";

import { QuoteRow } from "#/credit/Rfqs/QuoteRow";
import styles from "#/credit/Rfqs/RfqCard.module.css";
import type { RfqCardVm } from "#/credit/rfqCardVm";

export interface RfqCardProps {
  vm: RfqCardVm;
  isNew: boolean;
  isExiting: boolean;
  onAccept(dealerId: number): void;
  onCancel(): void;
  onRemove(): void;
}

type CardState = "live" | "accepted" | "terminated";
type CardAnim = "enter" | "exit" | "none";

// PROTO L568-580: one streaming RFQ card — header (dir chip, ticker, state
// label), the dealer quote list, and a footer that switches on the RFQ's
// lifecycle (live countdown+cancel, accepted confirmation, or
// terminated+remove). data-anim/data-parity pick the entrance/exit keyframe
// pair from global.css (cardInA/B, cardOut). PROTO's extra "flash on
// accept" branch keys off a card that is BOTH terminated AND the
// just-accepted id, which can never both be true here (acceptQuote only
// ever produces a Closed, not terminated, rfq) — it is dead in the
// reference and is not ported.
export function RfqCard(props: RfqCardProps): ReactElement {
  const { vm, isNew, isExiting, onAccept, onCancel, onRemove } = props;
  const state = cardState(vm);
  const anim = cardAnim(isNew, isExiting);
  const barStyle = { "--bar-pct": `${vm.pct}%` } as CSSProperties;

  return (
    <div
      className={styles.card}
      data-state={state}
      data-anim={anim}
      data-parity={vm.rid % 2 ? "b" : "a"}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <span className={styles.dirChip} data-dir={vm.dir.toLowerCase()}>
              {vm.dir.toUpperCase()}
            </span>
            <span className={styles.ticker}>{vm.ticker}</span>
          </div>
          <div className={styles.subline}>
            {vm.cusip} · QTY {vm.qty}
          </div>
        </div>
        <span className={styles.stateLabel} data-state={state}>
          {vm.stateLabel}
        </span>
      </div>

      <div className={styles.quotes}>
        {vm.quotes.map((q) => {
          return (
            <QuoteRow
              key={q.dealerId}
              vm={q}
              onAccept={() => {
                onAccept(q.dealerId);
              }}
            />
          );
        })}
      </div>

      <div className={styles.footer}>
        {vm.live ? (
          <div className={styles.liveRow}>
            <span className={styles.secs}>{vm.secs} secs</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={barStyle} />
            </div>
            <button
              type="button"
              className={styles.cancelBtn}
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
          <button type="button" className={styles.removeRow} onClick={onRemove}>
            <span className={styles.binGlyph}>🗑</span>
            <span className={styles.removeText}>{vm.stateLabel} · remove</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function cardState(vm: RfqCardVm): CardState {
  if (vm.live) {
    return "live";
  }

  if (vm.accepted) {
    return "accepted";
  }

  return "terminated";
}

function cardAnim(isNew: boolean, isExiting: boolean): CardAnim {
  if (isExiting) {
    return "exit";
  }

  if (isNew) {
    return "enter";
  }

  return "none";
}
