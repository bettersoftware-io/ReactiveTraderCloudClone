import styles from "./PnlValue.module.css";

interface PnlValueProps {
  value: number;
}

function formatPnl(value: number): string {
  const abs = Math.abs(value);
  let formatted: string;

  if (abs >= 1_000_000) {
    formatted = `${(abs / 1_000_000).toFixed(2)}m`;
  } else if (abs >= 1_000) {
    formatted = `${(abs / 1_000).toFixed(1)}k`;
  } else {
    formatted = abs.toFixed(0);
  }

  return (value >= 0 ? "+" : "-") + formatted;
}

export function PnlValue({ value }: PnlValueProps) {
  const sign = value >= 0 ? "pos" : "neg";

  return (
    <div data-sign={sign} className={styles.value}>
      {formatPnl(value)}
    </div>
  );
}
