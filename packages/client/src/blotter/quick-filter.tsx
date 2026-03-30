interface QuickFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function QuickFilter({ value, onChange }: QuickFilterProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Quick filter..."
      style={{
        padding: "4px 8px",
        fontSize: 12,
        border: "1px solid var(--border-primary)",
        borderRadius: 3,
        backgroundColor: "transparent",
        color: "var(--text-primary)",
        outline: "none",
        width: 200,
      }}
    />
  );
}
