export type ViewMode = "chart" | "price";

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <button
      onClick={() => onChange(mode === "chart" ? "price" : "chart")}
      title={`Switch to ${mode === "chart" ? "price" : "chart"} view`}
      style={{
        padding: "4px 10px",
        fontSize: 12,
        border: "1px solid var(--border-primary)",
        borderRadius: 3,
        cursor: "pointer",
        background: "none",
        color: "var(--text-secondary)",
      }}
    >
      {mode === "chart" ? "\u25A4 Price" : "\u2937 Chart"}
    </button>
  );
}
