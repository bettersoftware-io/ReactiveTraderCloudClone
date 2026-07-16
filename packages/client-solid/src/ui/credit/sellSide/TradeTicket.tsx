import type { JSX } from "solid-js";
import { createMemo, createSignal, Show } from "solid-js";

import { type Instrument, type Quote, type Rfq, RfqState } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./TradeTicket.module.css";

export function TradeTicket(props: TradeTicketProps): JSX.Element {
  const { useTicketSubmission, useAnimationIntents } = useViewModel();
  // App-layer machine: submit-price / pass flow + the submitted flag. The
  // component keeps only the price draft + parseFloat guard below.
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const anim = useAnimationIntents(`rfq:${props.rfq.id}`);
  const ticket = useTicketSubmission();
  const { submitPrice, pass } = ticket;
  const [price, setPrice] = createSignal("");

  const isActive = createMemo((): boolean => {
    return (
      props.rfq.state === RfqState.Open &&
      props.quote.state.type === "pendingWithoutPrice"
    );
  });
  const hasResponded = createMemo((): boolean => {
    return props.quote.state.type !== "pendingWithoutPrice";
  });
  const animKind = createMemo((): "fill" | undefined => {
    return anim()?.kind === "fill" ? "fill" : undefined;
  });
  const submitted = createMemo((): boolean => {
    return ticket.state().submitted;
  });

  function handleSubmit(): void {
    const num = Number.parseFloat(price());

    if (Number.isNaN(num) || num <= 0) {
      return;
    }

    submitPrice(props.quote.id, num);
  }

  function handlePass(): void {
    pass(props.quote.id);
  }

  // React's onChange fires on every keystroke (native `input` event);
  // Solid's onChange maps to the native `change` event only (fires on
  // blur/commit) — both wired to this one handler so real typing (`input`,
  // what @testing-library/user-event's type() dispatches) and a
  // programmatic `change` both narrow live (mirrors QuickFilter.tsx).
  function handlePriceEdit(e: InputChangeEvent): void {
    setPrice(e.currentTarget.value);
  }

  return (
    <div
      class={styles.ticket}
      data-active={props.rfq.state === RfqState.Open ? "true" : "false"}
      data-anim={animKind()}
    >
      <div>
        <div class={styles.instrumentName}>
          {props.instrument?.name ?? `Instrument #${props.rfq.instrumentId}`}
        </div>
        <div class={styles.instrumentMeta}>
          {props.instrument?.cusip} | {props.rfq.direction} | Qty:{" "}
          {props.rfq.quantity.toLocaleString()}
        </div>
      </div>

      <Show
        when={hasResponded() || submitted()}
        fallback={
          <Show
            when={isActive()}
            fallback={
              <div class={styles.closedText}>
                {props.rfq.state === RfqState.Cancelled
                  ? "Cancelled"
                  : props.rfq.state === RfqState.Expired
                    ? "Expired"
                    : "Closed"}
              </div>
            }
          >
            <div class={styles.inputRow}>
              <input
                type="number"
                data-testid="trade-ticket-price"
                value={price()}
                onInput={handlePriceEdit}
                onChange={handlePriceEdit}
                placeholder="Price"
                class={styles.priceInput}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!price()}
                data-can-submit={price() ? "true" : "false"}
                class={styles.submitBtn}
              >
                Submit
              </button>
              <button type="button" onClick={handlePass} class={styles.passBtn}>
                Pass
              </button>
            </div>
          </Show>
        }
      >
        <div class={styles.respondedText}>
          {props.quote.state.type === "passed"
            ? "Passed"
            : props.quote.state.type === "pendingWithPrice"
              ? `Quoted: $${props.quote.state.price}`
              : props.rfq.state === RfqState.Cancelled
                ? "RFQ Cancelled"
                : props.rfq.state === RfqState.Expired
                  ? "RFQ Expired"
                  : "Responded"}
        </div>
      </Show>
    </div>
  );
}

interface TradeTicketProps {
  rfq: Rfq;
  quote: Quote;
  instrument: Instrument | undefined;
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
