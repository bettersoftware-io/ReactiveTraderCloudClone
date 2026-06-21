import { type ViewMode } from "@rtc/domain";
import styles from "./ViewToggle.module.css";

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <button
      data-testid="view-toggle"
      onClick={() => onChange(mode === "chart" ? "price" : "chart")}
      title={`Switch to ${mode === "chart" ? "price" : "chart"} view`}
      className={styles.toggle}
    >
      {mode === "chart" ? "\u25A4 Price" : "\u2937 Chart"}
    </button>
  );
}
