import type {
  CSSProperties,
  AnimationEvent as ReactAnimationEvent,
  ReactElement,
} from "react";
import { useEffect, useRef } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { QuoteRow } from "./QuoteRow";
import type { CardAnim } from "./rfqCardAnim";
import type { RfqCardVm } from "./rfqCardVm";

import styles from "./RfqCard.module.css";

/** PROTO Rfqs/RfqCard.tsx: one streaming RFQ card — header (dir chip,
 * ticker, state label), the dealer quote list, and a footer that switches on
 * the RFQ's lifecycle (live countdown+cancel, accepted confirmation, or
 * terminated+remove). The countdown is read from the real useRfqCountdown
 * machine (cosmetic-only; CreditRfqSimulator drives the authoritative
 * expiry), not recomputed here.
 *
 * `anim`/`delayMs` drive the entrance/exit keyframes (PROTO cardInA/cardInB/
 * cardOut, data-parity alternating by rfq id parity) — RfqsPanel computes
 * both without a clock (see rfqCardAnim.ts) and clears its `entering`/
 * `exiting` bookkeeping via `onAnimationEnd`, fired by the CSS animation's
 * own native completion (no timer scheduling anywhere in this module:
 * src/ui timer primitives are banned by grep-gates.ts gate 29).
 * `data-anim` only ever selects ONE keyframe at a time, so the handler
 * doesn't need to read `event.animationName` — it just reports whichever
 * one is CURRENTLY selected via the `anim` prop. Reduced-motion users never
 * receive `anim !== "none"` in the first place (RfqsPanel skips the
 * cascade for them), so `onAnimationEnd` simply never fires — nothing is
 * left to clear.
 *
 * A mid-flight `prefers-reduced-motion` flip can CANCEL rather than end the
 * exit keyframe (final review M-a): it's gated on `prefers-reduced-motion:
 * no-preference` (RfqCard.module.css), so a card mid-exit whose OS setting
 * flips to *reduce* gets the animation cancelled by the browser —
 * `animationcancel`, never `animationend` — and without handling it,
 * RfqsPanel's `exiting`/`entering` bookkeeping for that card would never
 * clear. React has no synthetic `onAnimationCancel` prop (unlike
 * `onAnimationEnd`/`onTransitionCancel` — checked react-dom's
 * simpleEventPluginEvents list, "animationcancel" isn't registered), so this
 * is wired via a native listener on the card's own ref instead of JSX;
 * treating cancel identically to completion is correct here — either way
 * the card's native animation is done playing. */
export function RfqCard(props: RfqCardProps): ReactElement {
  const {
    vm,
    creationTimestamp,
    expirySecs,
    anim,
    delayMs,
    onAccept,
    onCancel,
    onRemove,
    onAnimationEnd,
  } = props;
  const totalMs = expirySecs * 1000;
  const { useRfqCountdown } = useViewModel();
  const remainingMs = useRfqCountdown(creationTimestamp, totalMs);
  const secs = Math.ceil(remainingMs / 1000);
  const pct = totalMs > 0 ? Math.max(0, (remainingMs / totalMs) * 100) : 0;
  const cardRef = useRef<HTMLDivElement>(null);

  function handleAnimationEnd(
    event: ReactAnimationEvent<HTMLDivElement>,
  ): void {
    // Ignore animations bubbling up from descendants (none currently exist,
    // but this keeps the handler correct if one is added later).
    if (event.target !== event.currentTarget) return;
    if (anim === "enter" || anim === "exit") onAnimationEnd(anim);
  }

  // See the doc comment above: no React synthetic event exists for
  // "animationcancel", so it's subscribed natively. jsdom (this repo's test
  // DOM) dispatches plain "animationcancel" events fine via addEventListener
  // — unlike animationend, there's no vendor-prefix fallback to feature-detect.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    function handleAnimationCancel(event: AnimationEvent): void {
      if (event.target !== event.currentTarget) return;
      if (anim === "enter" || anim === "exit") onAnimationEnd(anim);
    }

    el.addEventListener("animationcancel", handleAnimationCancel);

    return () => {
      el.removeEventListener("animationcancel", handleAnimationCancel);
    };
  }, [anim, onAnimationEnd]);

  return (
    <div
      ref={cardRef}
      className={styles.card}
      data-state={vm.cardState}
      data-anim={anim}
      data-parity={vm.rfqId % 2 ? "b" : "a"}
      data-testid={`rfq-card-${vm.rfqId}`}
      onAnimationEnd={handleAnimationEnd}
      // eslint-disable-next-line no-restricted-syntax -- runtime entrance-stagger delay via CSS custom property; static CSS can't express it
      style={{ "--card-delay": `${delayMs}ms` } as CSSProperties}
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
              <div
                className={styles.barFill}
                // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
                style={{ "--bar-pct": `${pct}%` } as CSSProperties}
              />
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
  /** Entrance/exit keyframe selector (see rfqCardAnim.ts), computed by RfqsPanel. */
  anim: CardAnim;
  /** Per-card entrance-stagger delay, in ms (0 outside a tab-switch cascade). */
  delayMs: number;
  onAccept: (quoteId: number) => void;
  onCancel: () => void;
  onRemove: () => void;
  /** Fired when this card's OWN CSS entrance/exit animation completes natively. */
  onAnimationEnd: (kind: "enter" | "exit") => void;
}
