import type { JSX } from "solid-js";
import { Show } from "solid-js";

import type { QuoteVm } from "./rfqCardVm";

import styles from "./QuoteRow.module.css";

/** PROTO Rfqs/QuoteRow.tsx: one dealer's quote line inside an RfqCard — a ★
 * when it's the best live price, the dealer name (house dealer tinted), the
 * price text, and an ACCEPT button while the quote is still live and priced. */
export function QuoteRow(props: QuoteRowProps): JSX.Element {
  return (
    <div
      class={styles.row}
      data-state={props.vm.state}
      data-best={String(props.vm.best)}
      data-house={String(props.vm.house)}
      data-testid={`rfq-quote-${props.vm.quoteId}`}
    >
      <div class={styles.name}>
        <Show when={props.vm.best}>
          <span class={styles.star}>★</span>
        </Show>
        <span
          class={styles.bank}
          data-house={String(props.vm.house)}
          data-testid={`rfq-quote-bank-${props.vm.quoteId}`}
        >
          {props.vm.bank}
        </span>
      </div>
      <div class={styles.priceWrap}>
        <span
          class={styles.price}
          data-state={props.vm.state}
          data-best={String(props.vm.best)}
        >
          {props.vm.priceText}
        </span>
        <Show when={props.vm.canAccept}>
          <button
            type="button"
            class={styles.acceptBtn}
            data-best={String(props.vm.best)}
            data-testid={`rfq-quote-accept-${props.vm.quoteId}`}
            onClick={props.onAccept}
          >
            ACCEPT
          </button>
        </Show>
      </div>
    </div>
  );
}

export interface QuoteRowProps {
  vm: QuoteVm;
  onAccept: () => void;
}
