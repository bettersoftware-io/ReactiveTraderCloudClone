import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import type { Instrument } from "@rtc/domain";

import styles from "./InstrumentSelect.module.css";

// PROTO NewRfq/InstrumentSelect.tsx: the instrument label button plus its
// dropdown of bonds — rows show the ticker headline over a "cusip · name"
// subtext line.
export function InstrumentSelect(props: InstrumentSelectProps): JSX.Element {
  function toggleInstrumentList(): void {
    props.onToggle();
  }

  function selectInstrument(instrument: Instrument) {
    return () => {
      props.onSelect(instrument);
    };
  }

  return (
    <div class={styles.wrap}>
      <button
        type="button"
        class={styles.label}
        data-testid="new-rfq-instrument-toggle"
        data-selected={String(props.selected != null)}
        data-open={String(props.open)}
        onClick={toggleInstrumentList}
      >
        <span>
          {props.selected ? props.selected.ticker : "Select instrument"}
        </span>
        <span class={styles.arrow}>▾</span>
      </button>

      <Show when={props.open}>
        <div class={styles.list}>
          <For each={props.instruments}>
            {(instrument: Instrument) => {
              return (
                <InstrumentRow
                  instrument={instrument}
                  onSelect={selectInstrument(instrument)}
                />
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

export interface InstrumentSelectProps {
  instruments: readonly Instrument[];
  selected: Instrument | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (instrument: Instrument) => void;
}

interface InstrumentRowProps {
  instrument: Instrument;
  onSelect: () => void;
}

function InstrumentRow(props: InstrumentRowProps): JSX.Element {
  function selectRow(): void {
    props.onSelect();
  }

  return (
    <button
      type="button"
      class={styles.row}
      data-testid={`new-rfq-instrument-option-${props.instrument.id}`}
      onClick={selectRow}
    >
      <div class={styles.ticker}>{props.instrument.ticker}</div>
      <div class={styles.meta}>
        {props.instrument.cusip} · {props.instrument.name}
      </div>
    </button>
  );
}
