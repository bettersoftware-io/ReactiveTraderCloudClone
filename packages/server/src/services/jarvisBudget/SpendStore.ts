/** Whose spend a row is: a signed-in account, or a roster persona. The house
 * total is not an owner a caller names; the store keeps it itself. */
export type SpendOwner = `account:${string}` | `roster:${string}`;

/** Whose API key paid: the house's, or one the person brought. */
export type KeyKind = "house" | "own";

export interface SpendTotals {
  /** The owner's spend for the day on the given key kind, in USD. */
  readonly ownerUsd: number;
  /** The house-key spend of everyone for the day; 0 for own-key spend. */
  readonly houseUsd: number;
}

/**
 * Durable per-day Jarvis spend. Either call answers `"unavailable"` when the
 * store cannot be reached or answers nonsense; the caller fails closed on it.
 */
export interface SpendStore {
  readonly kind: "supabase" | "in-memory";
  read(
    owner: SpendOwner,
    day: string,
    keyKind: KeyKind,
  ): Promise<SpendTotals | "unavailable">;
  /** Adds one turn's cost and returns the new totals. */
  record(
    owner: SpendOwner,
    day: string,
    keyKind: KeyKind,
    usd: number,
  ): Promise<SpendTotals | "unavailable">;
}
