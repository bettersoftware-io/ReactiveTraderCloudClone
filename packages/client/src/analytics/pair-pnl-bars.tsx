import type { CurrencyPairPosition } from "@rtc/domain";

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

function formatPnl(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return (value / 1_000_000).toFixed(1) + "m";
  if (abs >= 1_000) return (value / 1_000).toFixed(0) + "k";
  return value.toFixed(0);
}

export function PairPnlBars({ positions }: PairPnlBarsProps) {
  const maxAbsPnl = Math.max(...positions.map((p) => Math.abs(p.basePnl)), 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        fontSize: 11,
      }}
    >
      {positions.map((pos) => {
        const fraction = pos.basePnl / maxAbsPnl;
        const isPositive = pos.basePnl >= 0;
        const barWidth = `${Math.abs(fraction) * 50}%`;

        return (
          <div
            key={pos.symbol}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              height: 18,
            }}
          >
            <span
              style={{
                width: 55,
                textAlign: "right",
                color: "var(--text-muted)",
                fontSize: 10,
                flexShrink: 0,
              }}
            >
              {pos.symbol}
            </span>
            <div
              style={{
                flex: 1,
                display: "flex",
                position: "relative",
                height: 12,
              }}
            >
              {/* Center line */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: "var(--border-primary)",
                }}
              />
              {/* Bar */}
              <div
                style={{
                  position: "absolute",
                  top: 1,
                  bottom: 1,
                  ...(isPositive
                    ? { left: "50%", width: barWidth }
                    : { right: "50%", width: barWidth }),
                  backgroundColor: isPositive
                    ? "var(--accent-positive)"
                    : "var(--accent-negative)",
                  borderRadius: 2,
                  opacity: 0.7,
                }}
              />
            </div>
            <span
              style={{
                width: 45,
                textAlign: "left",
                color: isPositive
                  ? "var(--accent-positive)"
                  : "var(--accent-negative)",
                fontSize: 10,
                flexShrink: 0,
              }}
            >
              {formatPnl(pos.basePnl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
