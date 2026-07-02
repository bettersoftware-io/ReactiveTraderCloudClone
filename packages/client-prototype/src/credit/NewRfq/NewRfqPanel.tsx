import type { ChangeEvent, ReactElement } from "react";

import { DealerChecklist } from "#/credit/NewRfq/DealerChecklist";
import { InstrumentSelect } from "#/credit/NewRfq/InstrumentSelect";
import styles from "#/credit/NewRfq/NewRfqPanel.module.css";
import type { Dir } from "#/credit/types";
import type { CreditFormApi } from "#/credit/useCreditForm";

export interface NewRfqPanelProps {
  form: CreditFormApi;
  onSend(): void;
}

// PROTO L538-555: the New RFQ form body — direction toggle, instrument
// picker, qty/duration, dealer checklist, clear/send actions. The panel
// chrome (head, ⊕ accessory, maximize) is supplied by the caller's <Panel>
// wrapper (Task 8) — this component renders only the form body.
export function NewRfqPanel(props: NewRfqPanelProps): ReactElement {
  const { form, onSend } = props;

  function handleQty(e: ChangeEvent<HTMLInputElement>): void {
    form.setQty(e.target.value);
  }

  return (
    <div className={styles.body}>
      <div className={styles.dirRow}>
        <DirButton
          dir="Buy"
          active={form.value.dir === "Buy"}
          onSelect={form.setDir}
        />
        <DirButton
          dir="Sell"
          active={form.value.dir === "Sell"}
          onSelect={form.setDir}
        />
      </div>

      <div className={styles.label}>Instrument</div>
      <InstrumentSelect form={form} />

      <div className={styles.fieldsRow}>
        <div className={styles.field}>
          <div className={styles.label}>Qty (000)</div>
          <input
            className={styles.qtyInput}
            value={form.value.qty}
            onChange={handleQty}
            placeholder="0"
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>Duration</div>
          <div className={styles.duration}>2 Min</div>
        </div>
      </div>

      <div className={styles.label}>Counterparties</div>
      <DealerChecklist form={form} />

      <div className={styles.actions}>
        <button type="button" className={styles.clearBtn} onClick={form.clear}>
          CLEAR
        </button>
        <button
          type="button"
          className={styles.sendBtn}
          data-enabled={String(form.valid)}
          disabled={!form.valid}
          onClick={onSend}
        >
          SEND RFQ
        </button>
      </div>
    </div>
  );
}

interface DirButtonProps {
  dir: Dir;
  active: boolean;
  onSelect(dir: Dir): void;
}

function DirButton(props: DirButtonProps): ReactElement {
  const { dir, active, onSelect } = props;

  function handleClick(): void {
    onSelect(dir);
  }

  return (
    <button
      type="button"
      className={styles.dirBtn}
      data-dir={dir.toLowerCase()}
      data-active={String(active)}
      onClick={handleClick}
    >
      You {dir}
    </button>
  );
}
