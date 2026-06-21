import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useRef,
} from "react";
import type {
  NotionalIntents,
  NotionalView,
} from "../../../../app/presenters/NotionalMachine";
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
}: TileNotionalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      notional.change(e.target.value);
    },
    [notional],
  );

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  }, []);

  const handleFocus = useCallback(() => {
    inputRef.current?.select();
  }, []);

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
