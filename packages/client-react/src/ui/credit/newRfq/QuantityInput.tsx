import type { ChangeEvent, ReactElement } from "react";
import { useId } from "react";

import {
  CREDIT_MAX_QUANTITY_INPUT,
  CREDIT_QUANTITY_MULTIPLIER,
} from "@rtc/domain";

import styles from "./QuantityInput.module.css";

export function QuantityInput({
  value,
  onChange,
}: QuantityInputProps): ReactElement {
  const inputId = useId();
  return (
    <div>
      <label htmlFor={inputId} className={styles.label}>
        Quantity (x{CREDIT_QUANTITY_MULTIPLIER.toLocaleString()})
      </label>
      <input
        type="number"
        id={inputId}
        data-testid="quantity-input"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>): void => {
          onChange(e.target.value);
        }}
        max={CREDIT_MAX_QUANTITY_INPUT}
        placeholder="Enter quantity..."
        className={styles.input}
      />
    </div>
  );
}

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
}
