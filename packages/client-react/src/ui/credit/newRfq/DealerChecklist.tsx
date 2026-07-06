import type { ReactElement } from "react";

import { ADAPTIVE_BANK_NAME, type Dealer } from "@rtc/domain";

import styles from "./DealerChecklist.module.css";

// PROTO NewRfq/DealerChecklist.tsx: "All Dealers" master toggle plus one
// checkbox row per dealer. The house dealer (Adaptive Bank) gets a tinted
// name via data-house.
export function DealerChecklist(props: DealerChecklistProps): ReactElement {
  const { dealers, selectedIds, onToggleDealer, onToggleAll } = props;
  const allSelected =
    dealers.length > 0 &&
    dealers.every((dealer) => {
      return selectedIds.includes(dealer.id);
    });

  return (
    <div className={styles.list}>
      <button
        type="button"
        className={styles.row}
        data-testid="new-rfq-dealer-all"
        data-checked={String(allSelected)}
        onClick={onToggleAll}
      >
        <CheckBox checked={allSelected} />
        <span className={styles.name}>All Dealers</span>
      </button>

      {dealers.map((dealer) => {
        const checked = selectedIds.includes(dealer.id);

        return (
          <button
            key={dealer.id}
            type="button"
            className={styles.row}
            data-testid={`new-rfq-dealer-${dealer.id}`}
            data-checked={String(checked)}
            data-house={String(dealer.name === ADAPTIVE_BANK_NAME)}
            onClick={() => {
              onToggleDealer(dealer.id);
            }}
          >
            <CheckBox checked={checked} />
            <span className={styles.name}>{dealer.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface DealerChecklistProps {
  dealers: readonly Dealer[];
  selectedIds: readonly number[];
  onToggleDealer(id: number): void;
  onToggleAll(): void;
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
