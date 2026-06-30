import type { ReactElement } from "react";
import { type ChangeEvent, type KeyboardEvent, useRef } from "react";

import type { NotionalIntents, NotionalView } from "@rtc/client-core";

import styles from "./TileNotional.module.css";

interface TileNotionalProps {
  notional: { state: NotionalView } & NotionalIntents;
  baseCurrency: string;
  disabled?: boolean;
}

export function TileNotional({
  notional,
  baseCurrency,
  disabled,
}: TileNotionalProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    notional.change(e.target.value);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  }

  function handleFocus(): void {
    inputRef.current?.select();
  }

  const hasError = !!notional.state.error;

  return (
    <div className={styles.wrapper}>
      <span className={styles.currencyLabel}>{baseCurrency}</span>
      <input
        ref={inputRef}
        value={notional.state.displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        disabled={disabled}
        data-error={hasError ? "true" : "false"}
        className={styles.input}
      />
      {!notional.state.isDefault && (
        <button
          type="button"
          onClick={notional.reset}
          title="Reset to default"
          className={styles.resetButton}
        >
          {"↺"}
        </button>
      )}
      {hasError && (
        <span data-testid="notional-error" className={styles.errorMessage}>
          {notional.state.error}
        </span>
      )}
    </div>
  );
}
