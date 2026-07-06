import type { ReactElement } from "react";

import type { QuoteVm } from "./rfqCardVm";

import styles from "./QuoteRow.module.css";

/** PROTO Rfqs/QuoteRow.tsx: one dealer's quote line inside an RfqCard — a ★
 * when it's the best live price, the dealer name (house dealer tinted), the
 * price text, and an ACCEPT button while the quote is still live and priced. */
export function QuoteRow(props: QuoteRowProps): ReactElement {
  const { vm, onAccept } = props;

  return (
    <div
      className={styles.row}
      data-state={vm.state}
      data-best={String(vm.best)}
      data-house={String(vm.house)}
      data-testid={`rfq-quote-${vm.quoteId}`}
    >
      <div className={styles.name}>
        {vm.best ? <span className={styles.star}>★</span> : null}
        <span
          className={styles.bank}
          data-house={String(vm.house)}
          data-testid={`rfq-quote-bank-${vm.quoteId}`}
        >
          {vm.bank}
        </span>
      </div>
      <div className={styles.priceWrap}>
        <span
          className={styles.price}
          data-state={vm.state}
          data-best={String(vm.best)}
        >
          {vm.priceText}
        </span>
        {vm.canAccept ? (
          <button
            type="button"
            className={styles.acceptBtn}
            data-best={String(vm.best)}
            data-testid={`rfq-quote-accept-${vm.quoteId}`}
            onClick={onAccept}
          >
            ACCEPT
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface QuoteRowProps {
  vm: QuoteVm;
  onAccept: () => void;
}
