import type { JSX } from "solid-js";
import { createMemo, For } from "solid-js";

import { ADAPTIVE_BANK_NAME, type Dealer } from "@rtc/domain";

import styles from "./DealerChecklist.module.css";

// PROTO NewRfq/DealerChecklist.tsx: "All Dealers" master toggle plus one
// checkbox row per dealer. The house dealer (Adaptive Bank) gets a tinted
// name via data-house.
export function DealerChecklist(props: DealerChecklistProps): JSX.Element {
  const allSelected = createMemo((): boolean => {
    return (
      props.dealers.length > 0 &&
      props.dealers.every((dealer) => {
        return props.selectedIds.includes(dealer.id);
      })
    );
  });

  return (
    <div class={styles.list}>
      <button
        type="button"
        class={styles.row}
        data-testid="new-rfq-dealer-all"
        data-checked={String(allSelected())}
        onClick={props.onToggleAll}
      >
        <CheckBox checked={allSelected()} />
        <span class={styles.name}>All Dealers</span>
      </button>

      <For each={props.dealers}>
        {(dealer: Dealer) => {
          const checked = createMemo((): boolean => {
            return props.selectedIds.includes(dealer.id);
          });

          return (
            <button
              type="button"
              class={styles.row}
              data-testid={`new-rfq-dealer-${dealer.id}`}
              data-checked={String(checked())}
              data-house={String(dealer.name === ADAPTIVE_BANK_NAME)}
              onClick={() => {
                props.onToggleDealer(dealer.id);
              }}
            >
              <CheckBox checked={checked()} />
              <span class={styles.name}>{dealer.name}</span>
            </button>
          );
        }}
      </For>
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

function CheckBox(props: CheckBoxProps): JSX.Element {
  return (
    <span class={styles.box} data-checked={String(props.checked)}>
      {props.checked ? "✓" : ""}
    </span>
  );
}
