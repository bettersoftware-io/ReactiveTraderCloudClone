import type { JSX } from "solid-js";
import { createMemo, For, onCleanup, onMount, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { QuoteRow } from "./QuoteRow";
import type { CardAnim } from "./rfqCardAnim";
import type { QuoteVm, RfqCardVm } from "./rfqCardVm";

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
 * clear. There is no Solid `onAnimationCancel` prop (the JSX event maps
 * follow the same DOM event set React's simpleEventPluginEvents list does —
 * "animationcancel" isn't registered), so this is wired via a native
 * listener on the card's own ref instead of JSX; treating cancel identically
 * to completion is correct here — either way the card's native animation is
 * done playing.
 *
 * `animationend` is ALSO wired via a native listener rather than the JSX
 * `onAnimationEnd` prop, for the same underlying reason the react port
 * dispatches a vendor-prefixed event in tests: this repo's jsdom has no
 * `window.AnimationEvent`, so it never fires a bare "animationend" — the
 * contract spec's `fireCardAnimationEnd` helper dispatches
 * "webkitAnimationEnd" instead (the name react-dom's own feature-detection
 * falls back to in exactly this jsdom). Solid's JSX binding only listens for
 * the unprefixed name, so it would silently never see that event; listening
 * for both names natively (real browsers only ever fire the unprefixed one,
 * so no double-invocation risk there) keeps this component correct in both
 * a real browser and this test environment. */
export function RfqCard(props: RfqCardProps): JSX.Element {
  const totalMs = props.expirySecs * 1000;
  const { useRfqCountdown } = useViewModel();
  const remainingMs = useRfqCountdown(props.creationTimestamp, totalMs);
  const secs = createMemo((): number => {
    return Math.ceil(remainingMs() / 1000);
  });
  // Captured ONCE at component setup (Solid components run their body once
  // per mount, the direct analogue of React's `useState(() => ...)`
  // initializer): the drain bar is a single mount-time CSS animation over
  // the RFQ's full lifetime, fast-forwarded to "now" via a negative
  // animation-delay — NOT re-driven per countdown tick (per-tick geometry
  // writes kept a main-thread animation alive every frame; see
  // RfqCard.module.css .barFill).
  const barTiming: JSX.CSSProperties = {
    "--bar-duration": `${totalMs}ms`,
    "--bar-delay": `${Math.min(0, remainingMs() - totalMs)}ms`,
  };
  let cardEl!: HTMLDivElement;

  // Ignore animations bubbling up from descendants (none currently exist,
  // but this keeps the handler correct if one is added later) — `data-anim`
  // only ever selects ONE keyframe at a time, so this doesn't need to read
  // `event.animationName`; it just reports whichever one is CURRENTLY
  // selected via the `anim` prop.
  function handleAnimationEnd(event: Event): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (props.anim === "enter" || props.anim === "exit") {
      props.onAnimationEnd(props.anim);
    }
  }

  // Both native listeners (see the doc comment above): no Solid synthetic
  // event exists for "animationcancel", and the unprefixed "animationend"
  // never fires in this repo's jsdom, so both are subscribed directly on
  // the card's own ref rather than via JSX.
  onMount(() => {
    cardEl.addEventListener("animationend", handleAnimationEnd);
    cardEl.addEventListener("webkitAnimationEnd", handleAnimationEnd);
    cardEl.addEventListener("animationcancel", handleAnimationEnd);

    onCleanup(() => {
      cardEl.removeEventListener("animationend", handleAnimationEnd);
      cardEl.removeEventListener("webkitAnimationEnd", handleAnimationEnd);
      cardEl.removeEventListener("animationcancel", handleAnimationEnd);
    });
  });

  return (
    <div
      ref={cardEl}
      class={styles.card}
      data-state={props.vm.cardState}
      data-anim={props.anim}
      data-parity={props.vm.rfqId % 2 ? "b" : "a"}
      data-testid={`rfq-card-${props.vm.rfqId}`}
      // eslint-disable-next-line no-restricted-syntax -- runtime entrance-stagger delay via CSS custom property; static CSS can't express it
      style={{ "--card-delay": `${props.delayMs}ms` }}
    >
      <div class={styles.header}>
        <div>
          <div class={styles.titleRow}>
            <span
              class={styles.dirChip}
              data-dir={props.vm.direction.toLowerCase()}
            >
              {props.vm.direction.toUpperCase()}
            </span>
            <span class={styles.ticker}>{props.vm.ticker}</span>
          </div>
          <div class={styles.subline}>
            {props.vm.cusip} · QTY {props.vm.qty}
          </div>
        </div>
        <span class={styles.stateLabel} data-state={props.vm.cardState}>
          {props.vm.stateLabel}
        </span>
      </div>

      <div class={styles.quotes}>
        <For each={props.vm.quotes}>
          {(q: QuoteVm) => {
            return (
              <QuoteRow
                vm={q}
                onAccept={() => {
                  props.onAccept(q.quoteId);
                }}
              />
            );
          }}
        </For>
      </div>

      <div class={styles.footer}>
        <Show when={props.vm.live}>
          <div class={styles.liveRow}>
            <span class={styles.secs}>{secs()} secs</span>
            <div class={styles.barTrack}>
              <div class={styles.barFill} style={barTiming} />
            </div>
            <button
              type="button"
              class={styles.cancelBtn}
              data-testid={`rfq-cancel-${props.vm.rfqId}`}
              onClick={props.onCancel}
            >
              CANCEL
            </button>
          </div>
        </Show>

        <Show when={props.vm.accepted}>
          <div class={styles.acceptedRow}>
            <span class={styles.checkGlyph}>✓</span>
            <span class={styles.acceptedText}>
              You traded with {props.vm.acceptedDealer}
            </span>
          </div>
        </Show>

        <Show when={props.vm.terminated}>
          <button
            type="button"
            class={styles.removeRow}
            data-testid={`rfq-remove-${props.vm.rfqId}`}
            onClick={props.onRemove}
          >
            <span class={styles.binGlyph}>🗑</span>
            <span class={styles.removeText}>
              {props.vm.stateLabel} · remove
            </span>
          </button>
        </Show>
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
