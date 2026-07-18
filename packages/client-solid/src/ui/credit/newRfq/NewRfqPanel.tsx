import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, Show } from "solid-js";

import {
  CREDIT_RFQ_EXPIRY_SECONDS,
  Direction,
  type Instrument,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { DealerChecklist } from "./DealerChecklist";
import { InstrumentSelect } from "./InstrumentSelect";

import styles from "./NewRfqPanel.module.css";

// PROTO NewRfq/NewRfqPanel.tsx: the New RFQ form body — direction toggle,
// instrument picker, qty/duration, dealer checklist, clear/send actions.
// Submission is driven by the app-layer useRfqSubmission() machine
// (editing→submitting→confirmed{rfqId}, auto-redirect via onCreated after
// REDIRECT_DELAY_MS); this component keeps only the draft input state.
export function NewRfqPanel(props: NewRfqPanelProps): JSX.Element {
  const { useInstruments, useDealers, useRfqSubmission } = useViewModel();
  const instruments = useInstruments();
  const dealers = useDealers();
  const submission = useRfqSubmission();
  const { submit } = submission;
  const status = createMemo(() => {
    return submission.state().status;
  });

  const submitting = createMemo((): boolean => {
    return status() === "submitting";
  });

  const [value, setValue] = createSignal<FormValue>(EMPTY_VALUE);
  const [instrumentOpen, setInstrumentOpen] = createSignal(false);

  // The docked NewRfqPanel is never unmounted (unlike the old tabbed
  // CreditWorkspace, which reset by unmounting on tab-switch). The machine
  // itself returns confirmed → editing once the redirect delay elapses
  // (RfqsPresenter.createSubmission); mirror that CLEAR here so the draft is
  // wiped exactly on that transition — not on every emission while editing,
  // and not on the initial mount (which already starts from EMPTY_VALUE).
  // `status` is tracked (not the whole `submission.state()`) per the
  // reactivity amendment; `previousStatus` is a plain closure binding, not a
  // signal, since nothing else needs to read it.
  let previousStatus = status();
  createEffect(() => {
    const currentStatus = status();

    if (previousStatus === "confirmed" && currentStatus === "editing") {
      setValue(EMPTY_VALUE);
      setInstrumentOpen(false);
    }

    previousStatus = currentStatus;
  });

  const selectedInstrument = createMemo((): Instrument | null => {
    return (
      instruments().find((instrument) => {
        return instrument.id === value().instrumentId;
      }) ?? null
    );
  });

  const quantity = createMemo((): number => {
    return Number.parseFloat(value().qty);
  });

  const valid = createMemo((): boolean => {
    return (
      selectedInstrument() !== null &&
      !Number.isNaN(quantity()) &&
      quantity() > 0 &&
      value().dealerIds.length > 0
    );
  });

  const canSubmit = createMemo((): boolean => {
    return valid() && !submitting();
  });

  const confirmedRfqId = createMemo((): number | null => {
    const currentState = submission.state();
    return currentState.status === "confirmed" ? currentState.rfqId : null;
  });

  function handleDir(dir: Direction): void {
    setValue((prev) => {
      return { ...prev, dir };
    });
  }

  function handleInstrumentToggle(): void {
    setInstrumentOpen((prev) => {
      return !prev;
    });
  }

  function handleInstrumentSelect(instrument: Instrument): void {
    setValue((prev) => {
      return { ...prev, instrumentId: instrument.id };
    });
    setInstrumentOpen(false);
  }

  function handleQty(qty: string): void {
    setValue((prev) => {
      return { ...prev, qty };
    });
  }

  // React's onChange fires on every keystroke (native `input` event);
  // Solid's onChange maps to the native `change` event only (fires on
  // blur/commit) — both wired to this one handler so real typing (`input`,
  // what @testing-library/user-event's type() dispatches) and a
  // programmatic `change` both narrow live (mirrors QuickFilter.tsx).
  function handleQtyEdit(e: InputChangeEvent): void {
    handleQty(e.currentTarget.value);
  }

  function handleToggleDealer(id: number): void {
    setValue((prev) => {
      const has = prev.dealerIds.includes(id);
      return {
        ...prev,
        dealerIds: has
          ? prev.dealerIds.filter((dealerId) => {
              return dealerId !== id;
            })
          : [...prev.dealerIds, id],
      };
    });
  }

  function handleToggleAllDealers(): void {
    setValue((prev) => {
      const allSelected =
        dealers().length > 0 &&
        dealers().every((dealer) => {
          return prev.dealerIds.includes(dealer.id);
        });
      return {
        ...prev,
        dealerIds: allSelected
          ? []
          : dealers().map((dealer) => {
              return dealer.id;
            }),
      };
    });
  }

  function handleClear(): void {
    setValue(EMPTY_VALUE);
    setInstrumentOpen(false);
  }

  function handleSend(): void {
    const instrument = selectedInstrument();

    if (!canSubmit() || !instrument) {
      return;
    }

    submit(
      {
        instrumentId: instrument.id,
        dealerIds: value().dealerIds,
        quantity: quantity(),
        direction: value().dir,
        expirySecs: CREDIT_RFQ_EXPIRY_SECONDS,
      },
      props.onCreated,
    );
  }

  return (
    <Show
      when={status() !== "confirmed"}
      fallback={
        <div class={styles.body} data-testid="new-rfq-confirmed">
          <div class={styles.confirmedTitle}>RFQ Created</div>
          <div class={styles.confirmedDetail}>
            {selectedInstrument()?.ticker} | {value().dir} | RFQ ID:{" "}
            {confirmedRfqId()}
          </div>
        </div>
      }
    >
      <div class={styles.body}>
        <div class={styles.dirRow}>
          <DirButton
            dir={Direction.Buy}
            active={value().dir === Direction.Buy}
            onSelect={handleDir}
          />
          <DirButton
            dir={Direction.Sell}
            active={value().dir === Direction.Sell}
            onSelect={handleDir}
          />
        </div>

        <div class={styles.label}>Instrument</div>
        <InstrumentSelect
          instruments={instruments()}
          selected={selectedInstrument()}
          open={instrumentOpen()}
          onToggle={handleInstrumentToggle}
          onSelect={handleInstrumentSelect}
        />

        <div class={styles.fieldsRow}>
          <div class={styles.field}>
            <div class={styles.label}>Qty (000)</div>
            <input
              class={styles.qtyInput}
              data-testid="new-rfq-qty-input"
              value={value().qty}
              onInput={handleQtyEdit}
              onChange={handleQtyEdit}
              placeholder="0"
            />
          </div>
          <div class={styles.field}>
            <div class={styles.label}>Duration</div>
            <div class={styles.duration}>{DURATION_LABEL}</div>
          </div>
        </div>

        <div class={styles.label}>Counterparties</div>
        <DealerChecklist
          dealers={dealers()}
          selectedIds={value().dealerIds}
          onToggleDealer={handleToggleDealer}
          onToggleAll={handleToggleAllDealers}
        />

        <div class={styles.actions}>
          <button
            type="button"
            class={styles.clearBtn}
            data-testid="new-rfq-clear"
            onClick={handleClear}
          >
            CLEAR
          </button>
          <button
            type="button"
            class={styles.sendBtn}
            data-testid="new-rfq-send"
            data-enabled={String(valid())}
            disabled={!canSubmit()}
            onClick={handleSend}
          >
            SEND RFQ
          </button>
        </div>
      </div>
    </Show>
  );
}

const SECONDS_PER_MINUTE = 60;
// "2 Min" — derived from CREDIT_RFQ_EXPIRY_SECONDS (120) rather than hardcoded.
const DURATION_LABEL = `${CREDIT_RFQ_EXPIRY_SECONDS / SECONDS_PER_MINUTE} Min`;

interface FormValue {
  dir: Direction;
  instrumentId: number | null;
  qty: string;
  dealerIds: readonly number[];
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };

const EMPTY_VALUE: FormValue = {
  dir: Direction.Buy,
  instrumentId: null,
  qty: "",
  dealerIds: [],
};

export interface NewRfqPanelProps {
  onCreated: (rfqId: number) => void;
}

interface DirButtonProps {
  dir: Direction;
  active: boolean;
  onSelect(dir: Direction): void;
}

function DirButton(props: DirButtonProps): JSX.Element {
  function handleClick(): void {
    props.onSelect(props.dir);
  }

  return (
    <button
      type="button"
      class={styles.dirBtn}
      data-testid={`new-rfq-dir-${props.dir.toLowerCase()}`}
      data-dir={props.dir.toLowerCase()}
      data-active={String(props.active)}
      onClick={handleClick}
    >
      You {props.dir}
    </button>
  );
}
