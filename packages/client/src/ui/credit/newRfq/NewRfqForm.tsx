import { useCallback, useMemo, useState } from "react";
import { Direction, CREDIT_MAX_QUANTITY_INPUT, type Instrument } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";
import { InstrumentSearch } from "./InstrumentSearch";
import { DealerSelection } from "./DealerSelection";
import { QuantityInput } from "./QuantityInput";

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
  const [selectedDealerIds, setSelectedDealerIds] = useState<Set<number>>(new Set());

  const submitting = submission.state.status === "submitting";

  // Default all dealers selected
  useMemo(() => {
    if (dealers.length > 0 && selectedDealerIds.size === 0) {
      setSelectedDealerIds(new Set(dealers.map((d) => d.id)));
    }
  }, [dealers, selectedDealerIds.size]);

  const quantityNum = parseFloat(quantity);
  const quantityError =
    quantity && !isNaN(quantityNum) && quantityNum > CREDIT_MAX_QUANTITY_INPUT
      ? "Max quantity exceeded"
      : null;

  const canSubmit =
    instrument !== null &&
    !isNaN(quantityNum) &&
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
  }, [canSubmit, instrument, submit, selectedDealerIds, quantityNum, direction, onCreated]);

  if (submission.state.status === "confirmed") {
    return (
      <div style={{
        backgroundColor: "var(--bg-tile)",
        border: "1px solid var(--border-primary)",
        borderRadius: 6,
        padding: 24,
        textAlign: "center",
        color: "var(--text-primary)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>RFQ Created</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {instrument?.name} | {direction} | RFQ ID: {submission.state.rfqId}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "var(--bg-tile)",
      border: "1px solid var(--border-primary)",
      borderRadius: 6,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      maxWidth: 400,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        New RFQ
      </span>

      <InstrumentSearch
        instruments={instruments}
        selected={instrument}
        onSelect={setInstrument}
      />

      <div>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          Direction
        </label>
        <div style={{ display: "flex", gap: 4 }}>
          {[Direction.Buy, Direction.Sell].map((dir) => (
            <button
              key={dir}
              onClick={() => setDirection(dir)}
              style={{
                flex: 1,
                padding: "6px 0",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--border-primary)",
                borderRadius: 3,
                cursor: "pointer",
                backgroundColor: direction === dir ? (dir === Direction.Buy ? "var(--accent-positive)" : "var(--accent-negative)") : "transparent",
                color: direction === dir ? "#fff" : "var(--text-secondary)",
              }}
            >
              {dir}
            </button>
          ))}
        </div>
      </div>

      <QuantityInput value={quantity} onChange={setQuantity} error={quantityError} />

      <DealerSelection
        dealers={dealers}
        selectedIds={selectedDealerIds}
        onChange={setSelectedDealerIds}
      />

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          padding: "8px 0",
          fontSize: 13,
          fontWeight: 600,
          border: "none",
          borderRadius: 4,
          cursor: canSubmit ? "pointer" : "not-allowed",
          backgroundColor: canSubmit ? "var(--accent-primary)" : "var(--border-primary)",
          color: "#fff",
          opacity: canSubmit ? 1 : 0.5,
        }}
      >
        {submitting ? "Submitting..." : "Submit RFQ"}
      </button>
    </div>
  );
}
