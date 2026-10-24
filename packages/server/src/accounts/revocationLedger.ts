export interface RevocationLedger {
  record(accountId: string, atMs: number): void;
  notBefore(accountId: string): number | null;
}

/**
 * The fallback for a stamp that could not be written to the account store:
 * tokens issued before `atMs` count as ended on this process until it
 * restarts. Keeps the later of two stamps for an account; past `maxEntries`
 * the oldest-recorded account is dropped.
 */
export function createRevocationLedger(maxEntries: number): RevocationLedger {
  const stamps = new Map<string, number>();

  return {
    record(accountId: string, atMs: number): void {
      const existing = stamps.get(accountId);
      const later = existing === undefined ? atMs : Math.max(existing, atMs);

      // Re-insert so the Map's order is recording order.
      stamps.delete(accountId);

      if (stamps.size >= maxEntries) {
        const oldest = stamps.keys().next().value;

        if (oldest !== undefined) {
          stamps.delete(oldest);
        }
      }

      stamps.set(accountId, later);
    },
    notBefore(accountId: string): number | null {
      return stamps.get(accountId) ?? null;
    },
  };
}
