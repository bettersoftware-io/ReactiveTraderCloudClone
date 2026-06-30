import type { ReactElement } from "react";
import { useState } from "react";

import { Direction, type Instrument } from "@rtc/domain";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import { DealerSelection } from "./DealerSelection";
import { InstrumentSearch } from "./InstrumentSearch";
import { QuantityInput } from "./QuantityInput";

import styles from "./NewRfqForm.module.css";

interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

export function NewRfqForm({ onCreated }: NewRfqFormProps): ReactElement {
  const { useInstruments, useDealers, useRfqSubmission } = useViewModel();
  const instruments = useInstruments();
  const dealers = useDealers();
  // App-layer machine: create→confirmation→redirect lifecycle. The component
  // keeps only draft input state below; orchestration (incl. the redirect
  // delay) lives in RfqsPresenter.createSubmission().
  const submission = useRfqSubmission();
  const { submit } = submission;

  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [direction, setDirection] = useState<Direction>(Direction.Buy);
  const [quantity, setQuantity] = useState("");
  // Dealers default to all-selected; an explicit, non-empty user choice
  // overrides that default. Derived during render (not synced via an effect),
  // so the component stays pure for the React Compiler — see
  // docs/adr/ADR-003. An empty override falls back to all, preserving the
  // original "selection can't be left empty" behaviour.
  const [dealerOverride, setDealerOverride] = useState<Set<number> | null>(
    null,
  );

  const submitting = submission.state.status === "submitting";

  const allDealerIds = new Set(
    dealers.map((d) => {
      return d.id;
    }),
  );
  const selectedDealerIds =
    dealerOverride && dealerOverride.size > 0 ? dealerOverride : allDealerIds;

  const quantityNum = parseFloat(quantity);

  const canSubmit =
    instrument !== null &&
    !Number.isNaN(quantityNum) &&
    quantityNum > 0 &&
    selectedDealerIds.size > 0 &&
    !submitting;

  function handleSubmit(): void {
    if (!canSubmit || !instrument) return;
    submit(
      {
        instrumentId: instrument.id,
        dealerIds: [...selectedDealerIds],
        quantity: quantityNum,
        direction,
      },
      onCreated,
    );
  }

  if (submission.state.status === "confirmed") {
    return (
      <div className={styles.confirmedCard}>
        <div className={styles.confirmedTitle}>RFQ Created</div>
        <div className={styles.confirmedDetail}>
          {instrument?.name} | {direction} | RFQ ID: {submission.state.rfqId}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <span className={styles.formTitle}>New RFQ</span>

      <InstrumentSearch
        instruments={instruments}
        selected={instrument}
        onSelect={setInstrument}
      />

      <div>
        <span className={styles.fieldLabel} data-testid="rfq-direction-label">
          Direction
        </span>
        <div className={styles.directionRow}>
          {[Direction.Buy, Direction.Sell].map((dir) => {
            return (
              <button
                key={dir}
                type="button"
                data-testid={`rfq-direction-${dir}`}
                data-direction={dir}
                data-selected={direction === dir ? "true" : "false"}
                onClick={() => {
                  return setDirection(dir);
                }}
                className={styles.directionBtn}
              >
                {dir}
              </button>
            );
          })}
        </div>
      </div>

      <QuantityInput value={quantity} onChange={setQuantity} />

      <DealerSelection
        dealers={dealers}
        selectedIds={selectedDealerIds}
        onChange={setDealerOverride}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        data-can-submit={canSubmit ? "true" : "false"}
        className={styles.submitBtn}
      >
        {submitting ? "Submitting..." : "Submit RFQ"}
      </button>
    </div>
  );
}
