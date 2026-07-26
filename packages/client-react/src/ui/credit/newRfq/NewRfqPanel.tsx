import type { ChangeEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import {
  CREDIT_RFQ_EXPIRY_SECONDS,
  Direction,
  type Instrument,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { DealerChecklist } from "./DealerChecklist";
import { InstrumentSelect } from "./InstrumentSelect";

import styles from "./NewRfqPanel.module.css";

// PROTO NewRfq/NewRfqPanel.tsx: the New RFQ form body — direction toggle,
// instrument picker, qty/duration, dealer checklist, clear/send actions.
// Submission is driven by the app-layer useRfqSubmission() machine
// (editing→submitting→confirmed{rfqId}, auto-redirect via onCreated after
// REDIRECT_DELAY_MS); this component keeps only the draft input state.
export function NewRfqPanel(props: NewRfqPanelProps): ReactElement {
  const { onCreated } = props;
  const { useInstruments, useDealers, useRfqSubmission } = useViewModel();
  const instruments = useInstruments();
  const dealers = useDealers();
  const submission = useRfqSubmission();
  const { submit } = submission;
  const submitting = submission.state.status === "submitting";

  const [value, setValue] = useState<FormValue>(EMPTY_VALUE);
  const [instrumentOpen, setInstrumentOpen] = useState(false);

  // The docked NewRfqPanel is never unmounted (unlike the old tabbed
  // CreditWorkspace, which reset by unmounting on tab-switch). The machine
  // itself returns confirmed → editing once the redirect delay elapses
  // (RfqsPresenter.createSubmission); mirror that CLEAR here so the draft is
  // wiped exactly on that transition — not on every render while editing, and
  // not on the initial mount (which already starts from EMPTY_VALUE).
  const previousStatusRef = useRef(submission.state.status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = submission.state.status;

    if (
      previousStatus === "confirmed" &&
      submission.state.status === "editing"
    ) {
      setValue(EMPTY_VALUE);
      setInstrumentOpen(false);
    }
  }, [submission.state.status]);

  const selectedInstrument =
    instruments.find((instrument) => {
      return instrument.id === value.instrumentId;
    }) ?? null;
  const quantity = Number.parseFloat(value.qty);
  const valid =
    selectedInstrument !== null &&
    !Number.isNaN(quantity) &&
    quantity > 0 &&
    value.dealerIds.length > 0;
  const canSubmit = valid && !submitting;

  function setDirection(dir: Direction): void {
    setValue((prev) => {
      return { ...prev, dir };
    });
  }

  function selectInstrument(instrument: Instrument): void {
    setValue((prev) => {
      return { ...prev, instrumentId: instrument.id };
    });
    setInstrumentOpen(false);
  }

  function setQuantityFromInput(e: ChangeEvent<HTMLInputElement>): void {
    setValue((prev) => {
      return { ...prev, qty: e.target.value };
    });
  }

  function toggleDealer(id: number): void {
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

  function toggleAllDealers(): void {
    setValue((prev) => {
      const allSelected =
        dealers.length > 0 &&
        dealers.every((dealer) => {
          return prev.dealerIds.includes(dealer.id);
        });
      return {
        ...prev,
        dealerIds: allSelected
          ? []
          : dealers.map((dealer) => {
              return dealer.id;
            }),
      };
    });
  }

  function toggleInstrumentDropdown(): void {
    setInstrumentOpen((prev) => {
      return !prev;
    });
  }

  function clearRfqDraft(): void {
    setValue(EMPTY_VALUE);
    setInstrumentOpen(false);
  }

  function submitRfq(): void {
    // Unreachable at runtime — the SEND button carries `disabled={!canSubmit}`,
    // so the DOM never dispatches this handler while the draft is invalid (the
    // three "keeps SEND RFQ disabled until …" contract specs pin that). It
    // stays because `!selectedInstrument` is what narrows the null away for
    // `selectedInstrument.id` below; deleting it only trades this line for a
    // non-null assertion. Expect it to show as uncovered.
    if (!canSubmit || !selectedInstrument) {
      return;
    }

    submit(
      {
        instrumentId: selectedInstrument.id,
        dealerIds: value.dealerIds,
        quantity,
        direction: value.dir,
        expirySecs: CREDIT_RFQ_EXPIRY_SECONDS,
      },
      onCreated,
    );
  }

  if (submission.state.status === "confirmed") {
    return (
      <div className={styles.body} data-testid="new-rfq-confirmed">
        <div className={styles.confirmedTitle}>RFQ Created</div>
        <div className={styles.confirmedDetail}>
          {selectedInstrument?.ticker} | {value.dir} | RFQ ID:{" "}
          {submission.state.rfqId}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.dirRow}>
        <DirButton
          dir={Direction.Buy}
          active={value.dir === Direction.Buy}
          onSelect={setDirection}
        />
        <DirButton
          dir={Direction.Sell}
          active={value.dir === Direction.Sell}
          onSelect={setDirection}
        />
      </div>

      <div className={styles.label}>Instrument</div>
      <InstrumentSelect
        instruments={instruments}
        selected={selectedInstrument}
        open={instrumentOpen}
        onToggle={toggleInstrumentDropdown}
        onSelect={selectInstrument}
      />

      <div className={styles.fieldsRow}>
        <div className={styles.field}>
          <div className={styles.label}>Qty (000)</div>
          <input
            className={styles.qtyInput}
            data-testid="new-rfq-qty-input"
            value={value.qty}
            onChange={setQuantityFromInput}
            placeholder="0"
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>Duration</div>
          <div className={styles.duration}>{DURATION_LABEL}</div>
        </div>
      </div>

      <div className={styles.label}>Counterparties</div>
      <DealerChecklist
        dealers={dealers}
        selectedIds={value.dealerIds}
        onToggleDealer={toggleDealer}
        onToggleAll={toggleAllDealers}
      />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.clearBtn}
          data-testid="new-rfq-clear"
          onClick={clearRfqDraft}
        >
          CLEAR
        </button>
        <button
          type="button"
          className={styles.sendBtn}
          data-testid="new-rfq-send"
          data-enabled={String(valid)}
          disabled={!canSubmit}
          onClick={submitRfq}
        >
          SEND RFQ
        </button>
      </div>
    </div>
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
  onSelect: (dir: Direction) => void;
}

function DirButton(props: DirButtonProps): ReactElement {
  const { dir, active, onSelect } = props;

  function selectDirection(): void {
    onSelect(dir);
  }

  return (
    <button
      type="button"
      className={styles.dirBtn}
      data-testid={`new-rfq-dir-${dir.toLowerCase()}`}
      data-dir={dir.toLowerCase()}
      data-active={String(active)}
      onClick={selectDirection}
    >
      You {dir}
    </button>
  );
}
