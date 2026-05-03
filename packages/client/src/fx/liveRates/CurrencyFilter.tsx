import { CURRENCY_CATEGORIES, type CurrencyCategory } from "@rtc/domain";

interface CurrencyFilterProps {
  selected: CurrencyCategory;
  onChange: (category: CurrencyCategory) => void;
}

export function CurrencyFilter({ selected, onChange }: CurrencyFilterProps) {
  return (
    <div data-testid="currency-filter" style={{ display: "flex", gap: 2 }}>
      {CURRENCY_CATEGORIES.map((cat) => (
        <button
          key={cat}
          data-testid={`filter-${cat}`}
          onClick={() => onChange(cat)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            fontWeight: selected === cat ? 600 : 400,
            backgroundColor:
              selected === cat
                ? "var(--accent-primary)"
                : "transparent",
            color:
              selected === cat
                ? "#fff"
                : "var(--text-secondary)",
            transition: "background-color 0.15s, color 0.15s",
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
