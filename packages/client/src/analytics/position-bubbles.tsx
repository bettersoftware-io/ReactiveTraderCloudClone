import type { CurrencyPairPosition } from "@rtc/domain";

interface PositionBubblesProps {
  positions: readonly CurrencyPairPosition[];
}

const MIN_RADIUS = 15;
const MAX_RADIUS = 60;

function computeRadius(
  basePnl: number,
  maxAbsPnl: number,
): number {
  if (maxAbsPnl === 0) return MIN_RADIUS;
  const fraction = Math.abs(basePnl) / maxAbsPnl;
  return MIN_RADIUS + fraction * (MAX_RADIUS - MIN_RADIUS);
}

export function PositionBubbles({ positions }: PositionBubblesProps) {
  const maxAbsPnl = Math.max(
    ...positions.map((p) => Math.abs(p.basePnl)),
    1,
  );

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        justifyContent: "center",
        alignItems: "center",
        padding: "8px 0",
      }}
    >
      {positions.map((pos) => {
        const radius = computeRadius(pos.basePnl, maxAbsPnl);
        const isPositive = pos.basePnl >= 0;
        const symbol = pos.symbol.slice(0, 3);

        return (
          <div
            key={pos.symbol}
            style={{
              width: radius * 2,
              height: radius * 2,
              borderRadius: "50%",
              backgroundColor: isPositive
                ? "rgba(34, 197, 94, 0.2)"
                : "rgba(239, 68, 68, 0.2)",
              border: `1px solid ${isPositive ? "var(--accent-positive)" : "var(--accent-negative)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: Math.max(9, radius / 3),
              fontWeight: 600,
              color: isPositive
                ? "var(--accent-positive)"
                : "var(--accent-negative)",
              flexShrink: 0,
            }}
          >
            {symbol}
          </div>
        );
      })}
    </div>
  );
}
