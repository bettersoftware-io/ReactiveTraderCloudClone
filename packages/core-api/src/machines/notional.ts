/** Data-only view emitted by the notional machine. */
export interface NotionalView {
  displayValue: string;
  numericValue: number;
  error: string | null;
  isRfq: boolean;
  isDefault: boolean;
}

export interface NotionalIntents {
  change: (input: string) => void;
  reset: () => void;
}
