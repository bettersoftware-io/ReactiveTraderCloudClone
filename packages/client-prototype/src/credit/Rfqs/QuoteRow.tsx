import type { ReactElement } from "react";

import styles from "#/credit/Rfqs/QuoteRow.module.css";
import type { QuoteVm } from "#/credit/rfqCardVm";

export interface QuoteRowProps {
  vm: QuoteVm;
  onAccept(): void;
}

// PROTO L572: one dealer's quote line inside an RfqCard — a ★ when it's the
// best live price, the dealer name (house dealer tinted), the price text,
// and an ACCEPT button while the quote is still live and priced.
export function QuoteRow(props: QuoteRowProps): ReactElement {
  const { vm, onAccept } = props;

  return (
    <div className={styles.row} data-state={vm.state}>
      <div className={styles.name}>
        {vm.best ? <span className={styles.star}>★</span> : null}
        <span className={styles.bank} data-house={String(vm.house)}>
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
            onClick={onAccept}
          >
            ACCEPT
          </button>
        ) : null}
      </div>
    </div>
  );
}
