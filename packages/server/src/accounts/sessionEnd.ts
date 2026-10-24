import type { CachedAccount } from "./accountStatusCache.js";

export type SessionEndVerdict = "ended" | "live" | "unavailable";

/**
 * The one rule for "has this session ended?", called by every gate. A token
 * issued strictly before the account's stamp (or the ledger's fallback stamp)
 * has ended; one issued AT the stamp is live. A missing `iat` has ended, and
 * so has anything non-finite: nothing unreadable counts as live.
 */
export function hasSessionEnded(
  issuedAt: number | null,
  account: CachedAccount,
  ledgerNotBefore: number | null,
): SessionEndVerdict {
  if (account.status === "unavailable") {
    return "unavailable";
  }

  if (account.status === "missing" || account.status !== "active") {
    return "ended";
  }

  if (issuedAt === null || !Number.isFinite(issuedAt)) {
    return "ended";
  }

  const stamps = [account.sessionsNotBefore, ledgerNotBefore];
  const notBefore = Math.max(
    ...stamps.map((stamp): number => {
      return stamp === null ? Number.NEGATIVE_INFINITY : stamp;
    }),
  );

  // A NaN stamp makes Math.max NaN: treat it as ended, never as live.
  if (Number.isNaN(notBefore) || issuedAt < notBefore) {
    return "ended";
  }

  return "live";
}
