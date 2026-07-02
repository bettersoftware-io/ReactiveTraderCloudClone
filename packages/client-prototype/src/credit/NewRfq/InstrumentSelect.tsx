import type { ReactElement } from "react";

import { INSTRUMENTS } from "#/credit/creditData";
import styles from "#/credit/NewRfq/InstrumentSelect.module.css";
import type { CreditFormApi } from "#/credit/useCreditForm";

export interface InstrumentSelectProps {
  form: CreditFormApi;
}

// PROTO L540-546: the instrument label button plus its dropdown of bonds.
export function InstrumentSelect(props: InstrumentSelectProps): ReactElement {
  const { form } = props;
  const selected = INSTRUMENTS.find((i) => {
    return i.id === form.value.instrumentId;
  });

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.label}
        data-selected={String(selected != null)}
        data-open={String(form.showInstr)}
        onClick={form.toggleInstr}
      >
        <span>{selected ? selected.ticker : "Select instrument"}</span>
        <span className={styles.arrow}>▾</span>
      </button>

      {form.showInstr ? (
        <div className={styles.list}>
          {INSTRUMENTS.map((i) => {
            return (
              <InstrumentRow
                key={i.id}
                ticker={i.ticker}
                cusip={i.cusip}
                name={i.name}
                onSelect={() => {
                  form.selectInstrument(i.id);
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

interface InstrumentRowProps {
  ticker: string;
  cusip: string;
  name: string;
  onSelect(): void;
}

function InstrumentRow(props: InstrumentRowProps): ReactElement {
  const { ticker, cusip, name, onSelect } = props;

  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <div className={styles.ticker}>{ticker}</div>
      <div className={styles.meta}>
        {cusip} · {name}
      </div>
    </button>
  );
}
