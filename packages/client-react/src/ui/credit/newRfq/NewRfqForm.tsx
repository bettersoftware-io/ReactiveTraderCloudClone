import { useCallback, useMemo, useState } from "react";

import {
  CREDIT_MAX_QUANTITY_INPUT,
  Direction,
  type Instrument,
} from "@rtc/domain";

import { useHooks } from "../../hooks/useHooks";
import { DealerSelection } from "./DealerSelection";
import { InstrumentSearch } from "./InstrumentSearch";
import { QuantityInput } from "./QuantityInput";

import styles from "./NewRfqForm.module.css";

interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

export function NewRfqForm({ onCreated }: NewRfqFormProps) {
  const hooks = useHooks();
  const instruments = hooks.useInstruments();
  const dealers = hooks.useDealers();
  // App-layer machine: create→confirmation→redirect lifecycle. The component
  // keeps only draft input state below; orchestration (incl. the redirect
  // delay) lives in RfqsPresenter.createSubmission().
  const submission = hooks.useRfqSubmission();
  const { submit } = submission;

  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [direction, setDirection] = useState<Direction>(Direction.Buy);
  const [quantity, setQuantity] = useState("");
  const [selectedDealerIds, setSelectedDealerIds] = useState<Set<number>>(
    new Set(),
  );

  const submitting = submission.state.status === "submitting";

  // Default all dealers selected
  useMemo(() => {
    if (dealers.length > 0 && selectedDealerIds.size === 0) {
      setSelectedDealerIds(new Set(dealers.map((d) => d.id)));
    }
  }, [dealers, selectedDealerIds.size]);

  const quantityNum = parseFloat(quantity);
  const quantityError =
    quantity &&
    !Number.isNaN(quantityNum) &&
    quantityNum > CREDIT_MAX_QUANTITY_INPUT
      ? "Max quantity exceeded"
      : null;

  const canSubmit =
    instrument !== null &&
    !Number.isNaN(quantityNum) &&
    quantityNum > 0 &&
    !quantityError &&
    selectedDealerIds.size > 0 &&
    !submitting;

  const handleSubmit = useCallback(() => {
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
  }, [
    canSubmit,
    instrument,
    submit,
    selectedDealerIds,
    quantityNum,
    direction,
    onCreated,
  ]);

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
          {[Direction.Buy, Direction.Sell].map((dir) => (
            <button
              key={dir}
              type="button"
              data-testid={`rfq-direction-${dir}`}
              data-direction={dir}
              data-selected={direction === dir ? "true" : "false"}
              onClick={() => setDirection(dir)}
              className={styles.directionBtn}
            >
              {dir}
            </button>
          ))}
        </div>
      </div>

      <QuantityInput
        value={quantity}
        onChange={setQuantity}
        error={quantityError}
      />

      <DealerSelection
        dealers={dealers}
        selectedIds={selectedDealerIds}
        onChange={setSelectedDealerIds}
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
