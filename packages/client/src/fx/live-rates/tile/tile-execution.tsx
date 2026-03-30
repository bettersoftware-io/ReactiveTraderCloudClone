import { Direction } from "@rtc/domain";

interface TileExecutionProps {
  onExecute: (direction: Direction) => void;
  disabled: boolean;
}

export function TileExecution({ onExecute, disabled }: TileExecutionProps) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button
        data-testid="sell-btn"
        onClick={() => onExecute(Direction.Sell)}
        disabled={disabled}
        style={{
          flex: 1,
          padding: "8px 0",
          fontSize: 13,
          fontWeight: 600,
          border: "1px solid var(--border-primary)",
          borderRadius: 4,
          cursor: disabled ? "default" : "pointer",
          backgroundColor: "transparent",
          color: disabled ? "var(--text-muted)" : "var(--accent-negative)",
          opacity: disabled ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        Sell
      </button>
      <button
        data-testid="buy-btn"
        onClick={() => onExecute(Direction.Buy)}
        disabled={disabled}
        style={{
          flex: 1,
          padding: "8px 0",
          fontSize: 13,
          fontWeight: 600,
          border: "1px solid var(--border-primary)",
          borderRadius: 4,
          cursor: disabled ? "default" : "pointer",
          backgroundColor: "transparent",
          color: disabled ? "var(--text-muted)" : "var(--accent-positive)",
          opacity: disabled ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        Buy
      </button>
    </div>
  );
}
