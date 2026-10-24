import type { AccountStatus } from "@rtc/domain";

import type { AccountDirectory } from "./AccountDirectory.js";

export type CachedAccount =
  | {
      readonly status: AccountStatus;
      readonly sessionsNotBefore: number | null;
    }
  | { readonly status: "missing" | "unavailable" };

export interface AccountStatusCache {
  read(accountId: string): Promise<CachedAccount>;
  /** Forget what is known of an account, and make a lookup already in flight
   * unable to remember its (possibly pre-change) answer. */
  invalidate(accountId: string): void;
}

export interface AccountStatusCacheOptions {
  readonly directory: Pick<AccountDirectory, "findAccount">;
  readonly ttlMs: number;
  readonly maxEntries: number;
  readonly now: () => number;
}

interface Entry {
  readonly account: CachedAccount;
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
  const inFlight = new Map<string, Promise<CachedAccount>>();

  // Generation of an account that was invalidated while a lookup ran, and
  // how many lookups (including superseded ones) are still running per
  // account. A generation is dropped only when the last of them settles, so
  // a superseded lookup can never compare against a forgotten generation;
  // both maps are bounded by the lookups in flight.
  const generations = new Map<string, number>();
  const running = new Map<string, number>();
  let lastGeneration = 0;

  async function readAccount(accountId: string): Promise<CachedAccount> {
    try {
      const found = await options.directory.findAccount(accountId);

      if (found.outcome !== "found") {
        return { status: found.outcome };
      }

      return {
        status: found.account.status,
        sessionsNotBefore: found.account.sessionsNotBefore,
      };
    } catch {
      return { status: "unavailable" };
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
    generation: number,
    ownPromise: () => Promise<CachedAccount> | undefined,
  ): Promise<CachedAccount> {
    running.set(accountId, (running.get(accountId) ?? 0) + 1);

    try {
      const account = await readAccount(accountId);

      // An invalidation since this lookup started means its answer may
      // predate the change: serve it to this caller, never remember it.
      if (
        account.status !== "unavailable" &&
        (generations.get(accountId) ?? 0) === generation
      ) {
        remember(accountId, { account, readAt });
      }

      return account;
    } finally {
      if (inFlight.get(accountId) === ownPromise()) {
        inFlight.delete(accountId);
      }

      const left = (running.get(accountId) ?? 1) - 1;

      if (left === 0) {
        running.delete(accountId);
        generations.delete(accountId);
      } else {
        running.set(accountId, left);
      }
    }
  }

  return {
    read(accountId: string): Promise<CachedAccount> {
      const now = options.now();
      const cached = entries.get(accountId);

      if (cached !== undefined && now < cached.readAt + options.ttlMs) {
        return Promise.resolve(cached.account);
      }

      const pending = inFlight.get(accountId);

      if (pending !== undefined) {
        return pending;
      }

      let started: Promise<CachedAccount> | undefined;
      started = lookUp(
        accountId,
        now,
        generations.get(accountId) ?? 0,
        (): Promise<CachedAccount> | undefined => {
          return started;
        },
      );
      inFlight.set(accountId, started);

      return started;
    },
    invalidate(accountId: string): void {
      entries.delete(accountId);

      if (inFlight.delete(accountId)) {
        lastGeneration += 1;
        generations.set(accountId, lastGeneration);
      }
    },
  };
}
