import type { AccountDirectory, AccountStatus } from "./AccountDirectory.js";

export type CachedStatus = AccountStatus | "missing" | "unavailable";

export interface AccountStatusCache {
  statusOf(accountId: string): Promise<CachedStatus>;
}

export interface AccountStatusCacheOptions {
  readonly directory: Pick<AccountDirectory, "findAccount">;
  readonly ttlMs: number;
  readonly maxEntries: number;
  readonly now: () => number;
}

interface Entry {
  readonly status: CachedStatus;
  readonly readAt: number;
}

/**
 * The upgrade's view of an account's status (spec §5.6): one directory read
 * per account per `ttlMs`, so a reconnect storm costs one lookup. A verdict
 * is cached; `unavailable` is NOT a verdict and is asked again next time.
 * Bounded: past `maxEntries` the oldest entry is dropped.
 */
export function createAccountStatusCache(
  options: AccountStatusCacheOptions,
): AccountStatusCache {
  const entries = new Map<string, Entry>();

  return {
    async statusOf(accountId: string): Promise<CachedStatus> {
      const now = options.now();
      const cached = entries.get(accountId);

      if (cached !== undefined && now < cached.readAt + options.ttlMs) {
        return cached.status;
      }

      const found = await options.directory.findAccount(accountId);
      const status: CachedStatus =
        found.outcome === "found" ? found.account.status : found.outcome;

      if (status !== "unavailable") {
        entries.delete(accountId);

        if (entries.size >= options.maxEntries) {
          const oldest = entries.keys().next().value;

          if (oldest !== undefined) {
            entries.delete(oldest);
          }
        }

        entries.set(accountId, { status, readAt: now });
      }

      return status;
    },
  };
}
