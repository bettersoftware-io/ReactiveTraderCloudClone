import { useCallback, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import type { UseNotionalResult } from "../../hooks/useNotional";

interface TileNotionalProps {
  notional: UseNotionalResult;
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
      notional.onChange(e.target.value);
    },
    [notional],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        inputRef.current?.blur();
      }
    },
    [],
  );

  const handleFocus = useCallback(() => {
    inputRef.current?.select();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        position: "relative",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          minWidth: 28,
        }}
      >
        {baseCurrency}
      </span>
      <input
        ref={inputRef}
        value={notional.displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        disabled={disabled}
        style={{
          flex: 1,
          background: "none",
          border: "none",
          borderBottom: `1px solid ${notional.error ? "var(--accent-negative)" : "var(--border-primary)"}`,
          color: "var(--text-primary)",
          fontSize: 13,
          padding: "2px 0",
          outline: "none",
          textAlign: "right",
          fontFamily: "inherit",
        }}
      />
      {!notional.isDefault && (
        <button
          onClick={notional.reset}
          title="Reset to default"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 12,
            padding: "0 2px",
            lineHeight: 1,
          }}
        >
          \u21BA
        </button>
      )}
      {notional.error && (
        <span
          style={{
            position: "absolute",
            bottom: -14,
            right: 0,
            fontSize: 10,
            color: "var(--accent-negative)",
          }}
        >
          {notional.error}
        </span>
      )}
    </div>
  );
}
