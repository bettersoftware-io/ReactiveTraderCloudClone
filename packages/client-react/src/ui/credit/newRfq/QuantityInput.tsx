import { CREDIT_MAX_QUANTITY_INPUT, CREDIT_QUANTITY_MULTIPLIER } from "@rtc/domain";
import styles from "./QuantityInput.module.css";

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

export function QuantityInput({ value, onChange, error }: QuantityInputProps) {
  return (
    <div className={styles.section}>
      <label className={styles.label}>
        Quantity (x{CREDIT_QUANTITY_MULTIPLIER.toLocaleString()})
      </label>
      <input
        type="number"
        data-testid="quantity-input"
        data-error={error ? "true" : "false"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        max={CREDIT_MAX_QUANTITY_INPUT}
        placeholder="Enter quantity..."
        className={styles.input}
      />
      {error && (
        <span className={styles.errorMsg}>{error}</span>
      )}
    </div>
  );
}
