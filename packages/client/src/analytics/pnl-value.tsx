interface PnlValueProps {
  value: number;
}

function formatPnl(value: number): string {
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = (abs / 1_000_000).toFixed(2) + "m";
  } else if (abs >= 1_000) {
    formatted = (abs / 1_000).toFixed(1) + "k";
  } else {
    formatted = abs.toFixed(0);
  }
  return (value >= 0 ? "+" : "-") + formatted;
}

export function PnlValue({ value }: PnlValueProps) {
  const isPositive = value >= 0;

  return (
    <div
      style={{
        fontSize: 20,
        fontWeight: 700,
        color: isPositive
          ? "var(--accent-positive)"
          : "var(--accent-negative)",
        textAlign: "center",
        padding: "4px 0",
      }}
    >
      {formatPnl(value)}
    </div>
  );
}
