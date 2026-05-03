import { PriceMovementType, type Price } from "@rtc/domain";

interface TilePriceProps {
  price: Price;
  ratePrecision: number;
  pipsPosition: number;
}

/**
 * Splits a formatted price into parts for big/pip/fractional display.
 * For EURUSD 1.53816 (pipsPosition=4, ratePrecision=5):
 *   prefix="1.53", pips="81", fractional="6"
 */
function splitPrice(
  value: number,
  ratePrecision: number,
  pipsPosition: number,
): { prefix: string; pips: string; fractional: string } {
  const formatted = value.toFixed(ratePrecision);
  const fractionalDigits = ratePrecision - pipsPosition;
  const pipEnd = formatted.length - fractionalDigits;
  const pipStart = pipEnd - 2;

  return {
    prefix: formatted.slice(0, pipStart),
    pips: formatted.slice(pipStart, pipEnd),
    fractional: fractionalDigits > 0 ? formatted.slice(pipEnd) : "",
  };
}

function PriceButton({
  label,
  value,
  ratePrecision,
  pipsPosition,
  movement,
  side,
}: {
  label: string;
  value: number;
  ratePrecision: number;
  pipsPosition: number;
  movement: PriceMovementType;
  side: "bid" | "ask";
}) {
  const { prefix, pips, fractional } = splitPrice(
    value,
    ratePrecision,
    pipsPosition,
  );

  const movementColor =
    movement === PriceMovementType.UP
      ? "var(--accent-positive)"
      : movement === PriceMovementType.DOWN
        ? "var(--accent-negative)"
        : undefined;

  return (
    <button
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: side === "bid" ? "flex-start" : "flex-end",
        padding: "6px 8px",
        background: "none",
        border: "1px solid var(--border-primary)",
        borderRadius: 4,
        cursor: "pointer",
        color: "var(--text-primary)",
        transition: "border-color 0.15s",
      }}
    >
      <span
        style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}
      >
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {prefix}
        </span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: movementColor ?? "var(--text-primary)",
          }}
        >
          {pips}
        </span>
        <span
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            position: "relative",
            top: -4,
          }}
        >
          {fractional}
        </span>
      </span>
    </button>
  );
}

export function TilePrice({ price, ratePrecision, pipsPosition }: TilePriceProps) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <PriceButton
        label="SELL"
        value={price.bid}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="bid"
      />
      <PriceButton
        label="BUY"
        value={price.ask}
        ratePrecision={ratePrecision}
        pipsPosition={pipsPosition}
        movement={price.movementType}
        side="ask"
      />
    </div>
  );
}

export function SpreadDisplay({ spread }: { spread: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        fontSize: 11,
        color: "var(--text-muted)",
        padding: "2px 0",
      }}
    >
      {spread}
    </div>
  );
}
