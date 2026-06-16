export type RfqFilter = "Live" | "All" | "Done" | "Expired" | "Cancelled";

const FILTERS: RfqFilter[] = ["Live", "All", "Done", "Expired", "Cancelled"];

interface RfqFilterTabsProps {
  selected: RfqFilter;
  onChange: (filter: RfqFilter) => void;
}

export function RfqFilterTabs({ selected, onChange }: RfqFilterTabsProps) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {FILTERS.map((f) => (
        <button
          key={f}
          data-testid={`rfq-filter-${f}`}
          onClick={() => onChange(f)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            fontWeight: selected === f ? 600 : 400,
            backgroundColor: selected === f ? "var(--accent-primary)" : "transparent",
            color: selected === f ? "#fff" : "var(--text-secondary)",
          }}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
