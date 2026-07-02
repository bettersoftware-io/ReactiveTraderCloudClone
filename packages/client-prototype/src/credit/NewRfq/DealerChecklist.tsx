import type { ReactElement } from "react";

import { DEALERS } from "#/credit/creditData";
import styles from "#/credit/NewRfq/DealerChecklist.module.css";
import type { CreditFormApi } from "#/credit/useCreditForm";

export interface DealerChecklistProps {
  form: CreditFormApi;
}

const HOUSE_DEALER_ID = 1;

// PROTO L552-554: "All Dealers" toggle plus one checkbox row per dealer.
// Dealer id 1 ("Adaptive Bank") is the house dealer — data-house tints it.
export function DealerChecklist(props: DealerChecklistProps): ReactElement {
  const { form } = props;

  return (
    <div className={styles.list}>
      <button
        type="button"
        className={styles.row}
        data-checked={String(form.allDealers)}
        onClick={form.toggleAllDealers}
      >
        <CheckBox checked={form.allDealers} />
        <span className={styles.name}>All Dealers</span>
      </button>

      {DEALERS.map((d) => {
        const checked = form.value.dealerIds.includes(d.id);

        return (
          <button
            key={d.id}
            type="button"
            className={styles.row}
            data-checked={String(checked)}
            data-house={String(d.id === HOUSE_DEALER_ID)}
            onClick={() => {
              form.toggleDealer(d.id);
            }}
          >
            <CheckBox checked={checked} />
            <span className={styles.name}>{d.name}</span>
          </button>
        );
      })}
    </div>
  );
}

interface CheckBoxProps {
  checked: boolean;
}

function CheckBox(props: CheckBoxProps): ReactElement {
  const { checked } = props;

  return (
    <span className={styles.box} data-checked={String(checked)}>
      {checked ? "✓" : ""}
    </span>
  );
}
