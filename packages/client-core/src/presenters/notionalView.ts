import type { NotionalView } from "@rtc/core-api";
import { isRfqRequired, parseNotional } from "@rtc/domain";

export function formatWithCommas(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
  });
}

/** The view a notional machine starts from, and returns to on `reset`. */
export function createInitialNotionalView(
  defaultNotional: number,
): NotionalView {
  return {
    displayValue: formatWithCommas(defaultNotional),
    numericValue: defaultNotional,
    error: null,
    isRfq: isRfqRequired(defaultNotional),
    isDefault: true,
  };
}

/** The view for one `change(input)`: a parse failure keeps the raw input and
 * carries the error; a parse success is reformatted with commas. */
export function reduceNotionalInput(
  defaultNotional: number,
  input: string,
): NotionalView {
  const result = parseNotional(input);

  if (result.value === null) {
    return {
      displayValue: input,
      numericValue: 0,
      error: result.error,
      isRfq: false,
      isDefault: false,
    };
  }

  return {
    displayValue: formatWithCommas(result.value),
    numericValue: result.value,
    error: result.error,
    isRfq: isRfqRequired(result.value),
    isDefault: result.value === defaultNotional,
  };
}
