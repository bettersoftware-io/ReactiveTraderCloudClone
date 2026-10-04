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
 * per account per `ttlMs`, and one in flight per account, so a reconnect storm
 * costs one lookup. A verdict is cached; `unavailable` is NOT a verdict and is
 * asked again next time — and a directory that throws or rejects reads as
 * `unavailable` too, so the gate fails closed instead of hanging.
 * Bounded: past `maxEntries` the oldest entry is dropped.
 */
export function createAccountStatusCache(
  options: AccountStatusCacheOptions,
): AccountStatusCache {
  const entries = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<CachedStatus>>();

  async function readStatus(accountId: string): Promise<CachedStatus> {
    try {
      const found = await options.directory.findAccount(accountId);

      return found.outcome === "found" ? found.account.status : found.outcome;
    } catch {
      return "unavailable";
    }
  }

  function remember(accountId: string, entry: Entry): void {
    const existing = entries.get(accountId);

    // Never let an older answer replace a newer one.
    if (existing !== undefined && existing.readAt > entry.readAt) {
      return;
    }

    entries.delete(accountId);

    if (entries.size >= options.maxEntries) {
      const oldest = entries.keys().next().value;

      if (oldest !== undefined) {
        entries.delete(oldest);
      }
    }

    entries.set(accountId, entry);
  }

  async function lookUp(
    accountId: string,
    readAt: number,
  ): Promise<CachedStatus> {
    try {
      const status = await readStatus(accountId);

      if (status !== "unavailable") {
        remember(accountId, { status, readAt });
      }

      return status;
    } finally {
      inFlight.delete(accountId);
    }
  }

  return {
    statusOf(accountId: string): Promise<CachedStatus> {
      const now = options.now();
      const cached = entries.get(accountId);

      if (cached !== undefined && now < cached.readAt + options.ttlMs) {
        return Promise.resolve(cached.status);
      }

      const pending = inFlight.get(accountId);

      if (pending !== undefined) {
        return pending;
      }

      const started = lookUp(accountId, now);
      inFlight.set(accountId, started);

      return started;
    },
  };
}
