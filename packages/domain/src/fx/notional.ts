export const DEFAULT_NOTIONAL = 1_000_000;
export const MAX_NOTIONAL = 1_000_000_000;
export const RFQ_THRESHOLD = 10_000_000;

export interface NotionalParseResult {
  readonly value: number | null;
  readonly error: string | null;
}

/**
 * Parses a notional string with optional k/m multiplier suffixes.
 * - "1k" => 1,000
 * - "2.5m" => 2,500,000
 * - "500" => 500
 */
export function parseNotional(input: string): NotionalParseResult {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { value: null, error: null };
  }

  const match = trimmed.match(/^(\d+\.?\d*)\s*([kKmM]?)$/);

  if (!match) {
    return { value: null, error: "Invalid input" };
  }

  const numeric = parseFloat(match[1]);
  const suffix = match[2].toLowerCase();

  let multiplier = 1;

  if (suffix === "k") {
    multiplier = 1_000;
  } else if (suffix === "m") {
    multiplier = 1_000_000;
  }

  const value = numeric * multiplier;

  if (value > MAX_NOTIONAL) {
    return { value, error: "Max exceeded" };
  }

  return { value, error: null };
}

export function isRfqRequired(notional: number): boolean {
  return notional >= RFQ_THRESHOLD;
}

export function validateNotional(value: number): string | null {
  if (value > MAX_NOTIONAL) {
    return "Max exceeded";
  }

  if (value <= 0) {
    return "Invalid value";
  }

  return null;
}
