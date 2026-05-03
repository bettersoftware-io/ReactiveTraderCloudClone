import { useCallback, useState } from "react";
import { parseNotional, isRfqRequired } from "@rtc/domain";

function formatWithCommas(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
  });
}

interface NotionalState {
  raw: string;
  value: number;
  error: string | null;
  isRfq: boolean;
  isDefault: boolean;
}

export interface UseNotionalResult {
  displayValue: string;
  numericValue: number;
  error: string | null;
  isRfq: boolean;
  isDefault: boolean;
  onChange: (input: string) => void;
  reset: () => void;
}

export function useNotional(defaultNotional: number): UseNotionalResult {
  const [state, setState] = useState<NotionalState>(() => ({
    raw: formatWithCommas(defaultNotional),
    value: defaultNotional,
    error: null,
    isRfq: isRfqRequired(defaultNotional),
    isDefault: true,
  }));

  const onChange = useCallback(
    (input: string) => {
      const result = parseNotional(input);
      if (result.value === null) {
        setState({
          raw: input,
          value: 0,
          error: result.error,
          isRfq: false,
          isDefault: false,
        });
        return;
      }
      setState({
        raw: formatWithCommas(result.value),
        value: result.value,
        error: result.error,
        isRfq: isRfqRequired(result.value),
        isDefault: result.value === defaultNotional,
      });
    },
    [defaultNotional],
  );

  const reset = useCallback(() => {
    setState({
      raw: formatWithCommas(defaultNotional),
      value: defaultNotional,
      error: null,
      isRfq: isRfqRequired(defaultNotional),
      isDefault: true,
    });
  }, [defaultNotional]);

  return {
    displayValue: state.raw,
    numericValue: state.value,
    error: state.error,
    isRfq: state.isRfq,
    isDefault: state.isDefault,
    onChange,
    reset,
  };
}
