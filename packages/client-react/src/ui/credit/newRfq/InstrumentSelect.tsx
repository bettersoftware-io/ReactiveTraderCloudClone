import type { ReactElement } from "react";

import type { Instrument } from "@rtc/domain";

import styles from "./InstrumentSelect.module.css";

// PROTO NewRfq/InstrumentSelect.tsx: the instrument label button plus its
// dropdown of bonds — rows show the ticker headline over a "cusip · name"
// subtext line.
export function InstrumentSelect(props: InstrumentSelectProps): ReactElement {
  const { instruments, selected, open, onToggle, onSelect } = props;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.label}
        data-testid="new-rfq-instrument-toggle"
        data-selected={String(selected != null)}
        data-open={String(open)}
        onClick={onToggle}
      >
        <span>{selected ? selected.ticker : "Select instrument"}</span>
        <span className={styles.arrow}>▾</span>
      </button>

      {open ? (
        <div className={styles.list}>
          {instruments.map((instrument) => {
            return (
              <InstrumentRow
                key={instrument.id}
                instrument={instrument}
                onSelect={() => {
                  onSelect(instrument);
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface InstrumentSelectProps {
  instruments: readonly Instrument[];
  selected: Instrument | null;
  open: boolean;
  onToggle(): void;
  onSelect(instrument: Instrument): void;
}

interface InstrumentRowProps {
  instrument: Instrument;
  onSelect(): void;
}

function InstrumentRow(props: InstrumentRowProps): ReactElement {
  const { instrument, onSelect } = props;

  return (
    <button
      type="button"
      className={styles.row}
      data-testid={`new-rfq-instrument-option-${instrument.id}`}
      onClick={onSelect}
    >
      <div className={styles.ticker}>{instrument.ticker}</div>
      <div className={styles.meta}>
        {instrument.cusip} · {instrument.name}
      </div>
    </button>
  );
}
