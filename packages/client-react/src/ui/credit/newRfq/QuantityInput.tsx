import { CREDIT_MAX_QUANTITY_INPUT, CREDIT_QUANTITY_MULTIPLIER } from "@rtc/domain";

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

export function QuantityInput({ value, onChange, error }: QuantityInputProps) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
        Quantity (x{CREDIT_QUANTITY_MULTIPLIER.toLocaleString()})
      </label>
      <input
        type="number"
        data-testid="quantity-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        max={CREDIT_MAX_QUANTITY_INPUT}
        placeholder="Enter quantity..."
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: 12,
          border: `1px solid ${error ? "var(--accent-negative)" : "var(--border-primary)"}`,
          borderRadius: 3,
          backgroundColor: "transparent",
          color: "var(--text-primary)",
          outline: "none",
        }}
      />
      {error && (
        <span style={{ fontSize: 10, color: "var(--accent-negative)" }}>{error}</span>
      )}
    </div>
  );
}
