import { useCallback } from "react";
import { type CurrencyPair, Direction, type Price } from "@rtc/domain";
import type { UseRfqStateResult } from "../../hooks/useRfqState";
import { RfqCountdown } from "./RfqCountdown";

interface TileRfqProps {
  pair: CurrencyPair;
  rfqState: UseRfqStateResult;
  onRequestQuote: () => void;
  onExecute: (direction: Direction, price: Price, notional: number) => void;
  notional: number;
}

function formatPrice(value: number, ratePrecision: number): string {
  return value.toFixed(ratePrecision);
}

export function TileRfq({
  pair,
  rfqState,
  onRequestQuote,
  onExecute,
  notional,
}: TileRfqProps) {
  const { state } = rfqState;

  const handleAccept = useCallback(
    (direction: Direction) => {
      const quote = rfqState.accept();
      if (!quote) return;
      // Create a synthetic Price to pass to execution
      const syntheticPrice = {
        symbol: pair.symbol,
        bid: quote.bid,
        ask: quote.ask,
        mid: (quote.bid + quote.ask) / 2,
        valueDate: new Date().toISOString().slice(0, 10),
        creationTimestamp: Date.now(),
        movementType: "NONE" as const,
        spread: "0",
      };
      onExecute(direction, syntheticPrice as Price, notional);
    },
    [rfqState, pair, onExecute, notional],
  );

  if (state.status === "init") {
    return (
      <button
        onClick={onRequestQuote}
        style={{
          padding: "8px 0",
          fontSize: 13,
          fontWeight: 600,
          border: "1px solid var(--accent-primary)",
          borderRadius: 4,
          backgroundColor: "transparent",
          color: "var(--accent-primary)",
          cursor: "pointer",
        }}
      >
        Initiate RFQ
      </button>
    );
  }

  if (state.status === "requested") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "var(--text-muted)",
            padding: "4px 0",
          }}
        >
          Awaiting Price...
        </div>
        <button
          onClick={rfqState.cancel}
          style={{
            padding: "6px 0",
            fontSize: 12,
            border: "1px solid var(--border-primary)",
            borderRadius: 4,
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Cancel RFQ
        </button>
      </div>
    );
  }

  if (state.status === "received" && state.quote) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => handleAccept(Direction.Sell)}
            style={{
              flex: 1,
              padding: "6px 4px",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid var(--border-primary)",
              borderRadius: 4,
              backgroundColor: "transparent",
              color: "var(--accent-negative)",
              cursor: "pointer",
            }}
          >
            Sell {formatPrice(state.quote.bid, pair.ratePrecision)}
          </button>
          <button
            onClick={() => handleAccept(Direction.Buy)}
            style={{
              flex: 1,
              padding: "6px 4px",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid var(--border-primary)",
              borderRadius: 4,
              backgroundColor: "transparent",
              color: "var(--accent-positive)",
              cursor: "pointer",
            }}
          >
            Buy {formatPrice(state.quote.ask, pair.ratePrecision)}
          </button>
        </div>
        <RfqCountdown
          remainingMs={state.remainingMs}
          totalMs={state.quote.timeoutMs}
        />
        <button
          onClick={rfqState.reject}
          style={{
            padding: "4px 0",
            fontSize: 11,
            border: "none",
            backgroundColor: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Reject
        </button>
      </div>
    );
  }

  if (state.status === "rejected") {
    return (
      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "var(--accent-negative)",
          padding: "8px 0",
        }}
      >
        Quote expired
      </div>
    );
  }

  return null;
}
