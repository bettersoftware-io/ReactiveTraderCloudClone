/** The UTC calendar day of an instant, `YYYY-MM-DD` — the key a day's spend
 * is filed under, and the same text a Postgres `date` column reads. */
export function utcDayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The next 00:00 UTC strictly after the instant (exactly midnight rolls to
 * the following one) — when a day's budget resets. */
export function nextUtcMidnightMs(ms: number): number {
  const now = new Date(ms);

  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
}
