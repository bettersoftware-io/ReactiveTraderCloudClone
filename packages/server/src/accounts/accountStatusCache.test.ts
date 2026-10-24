import { describe, expect, it } from "vitest";

import type { AccountStatus } from "@rtc/domain";

import type { AccountLookup } from "#/accounts/AccountDirectory";
import { createAccountStatusCache } from "#/accounts/accountStatusCache";

describe("accountStatusCache", () => {
  it("asks the directory once within the TTL and again after it", async () => {
    const lookups = createLookups(["active", "blocked"]);
    let now = 1_000;
    const cache = createAccountStatusCache({
      directory: lookups,
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return now;
      },
    });

    expect(await cache.statusOf("acc-1")).toBe("active");
    now = 60_999;
    expect(await cache.statusOf("acc-1")).toBe("active");
    expect(lookups.calls).toBe(1);

    now = 61_000;
    expect(await cache.statusOf("acc-1")).toBe("blocked");
    expect(lookups.calls).toBe(2);
  });

  it("caches a missing account as missing", async () => {
    const lookups = createLookups(["missing"]);
    const cache = createCache(lookups);

    expect(await cache.statusOf("acc-1")).toBe("missing");
    expect(await cache.statusOf("acc-1")).toBe("missing");
    expect(lookups.calls).toBe(1);
  });

  it("never caches unavailable — the next call asks again (Review Focus 5)", async () => {
    const lookups = createLookups(["unavailable", "active"]);
    const cache = createCache(lookups);

    expect(await cache.statusOf("acc-1")).toBe("unavailable");
    expect(await cache.statusOf("acc-1")).toBe("active");
    expect(lookups.calls).toBe(2);
  });

  it("holds at most maxEntries, dropping the oldest", async () => {
    const lookups = createLookups(["active", "active", "active", "blocked"]);
    const cache = createAccountStatusCache({
      directory: lookups,
      ttlMs: 60_000,
      maxEntries: 2,
      now: (): number => {
        return 1_000;
      },
    });

    await cache.statusOf("acc-1");
    await cache.statusOf("acc-2");
    await cache.statusOf("acc-3");

    // acc-1 was evicted, so it is looked up again.
    expect(await cache.statusOf("acc-1")).toBe("blocked");
    expect(lookups.calls).toBe(4);
  });

  it("answers unavailable, uncached, when the directory rejects (fails closed)", async () => {
    let calls = 0;
    const cache = createAccountStatusCache({
      directory: {
        findAccount: (): Promise<AccountLookup> => {
          calls += 1;

          return Promise.reject(new Error("socket hang up"));
        },
      },
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return 1_000;
      },
    });

    expect(await cache.statusOf("acc-1")).toBe("unavailable");
    expect(await cache.statusOf("acc-1")).toBe("unavailable");
    expect(calls).toBe(2);
  });

  it("answers unavailable, uncached, when the directory throws synchronously", async () => {
    let calls = 0;
    const cache = createAccountStatusCache({
      directory: {
        findAccount: (): Promise<AccountLookup> => {
          calls += 1;

          throw new Error("boom");
        },
      },
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return 1_000;
      },
    });

    expect(await cache.statusOf("acc-1")).toBe("unavailable");
    expect(await cache.statusOf("acc-1")).toBe("unavailable");
    expect(calls).toBe(2);
  });

  it("shares one in-flight lookup between concurrent callers of one account", async () => {
    const deferred = createDeferredDirectory();
    const cache = createAccountStatusCache({
      directory: deferred,
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return 1_000;
      },
    });

    const first = cache.statusOf("acc-1");
    const second = cache.statusOf("acc-1");
    expect(deferred.pending).toHaveLength(1);

    deferred.settle(0, "blocked");

    expect(await first).toBe("blocked");
    expect(await second).toBe("blocked");
    expect(deferred.pending).toHaveLength(1);
  });

  it("forgets an unavailable in-flight lookup, so the next call asks again", async () => {
    const deferred = createDeferredDirectory();
    const cache = createAccountStatusCache({
      directory: deferred,
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return 1_000;
      },
    });

    const first = cache.statusOf("acc-1");
    deferred.settle(0, "unavailable");
    expect(await first).toBe("unavailable");

    const second = cache.statusOf("acc-1");
    expect(deferred.pending).toHaveLength(2);
    deferred.settle(1, "active");
    expect(await second).toBe("active");
  });

  it("releases the in-flight slot once settled: other ids are independent and a repeat is served from the cache", async () => {
    const deferred = createDeferredDirectory();
    const cache = createAccountStatusCache({
      directory: deferred,
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return 1_000;
      },
    });

    const one = cache.statusOf("acc-1");
    deferred.settle(0, "active");
    await one;

    const other = cache.statusOf("acc-2");
    expect(deferred.pending).toHaveLength(2);
    deferred.settle(1, "blocked");
    expect(await other).toBe("blocked");

    expect(await cache.statusOf("acc-1")).toBe("active");
    expect(deferred.pending).toHaveLength(2);
  });
});

type Scripted = AccountStatus | "missing" | "unavailable";

interface ScriptedLookups {
  calls: number;
  findAccount(accountId: string): Promise<AccountLookup>;
}

/** Answers each lookup with the next scripted status, counting calls. */
function createLookups(script: readonly Scripted[]): ScriptedLookups {
  const lookups: ScriptedLookups = {
    calls: 0,
    findAccount(accountId: string): Promise<AccountLookup> {
      const next = script[lookups.calls] ?? "unavailable";
      lookups.calls += 1;

      if (next === "missing" || next === "unavailable") {
        return Promise.resolve({ outcome: next });
      }

      return Promise.resolve({
        outcome: "found",
        account: {
          id: accountId,
          email: "ann@desk.io",
          displayName: "Ann Lee",
          access: "user",
          status: next,
          createdAt: 0,
          sessionsNotBefore: null,
        },
      });
    },
  };

  return lookups;
}

function createCache(
  lookups: ScriptedLookups,
): ReturnType<typeof createAccountStatusCache> {
  return createAccountStatusCache({
    directory: lookups,
    ttlMs: 60_000,
    maxEntries: 10,
    now: (): number => {
      return 1_000;
    },
  });
}

interface DeferredDirectory {
  readonly pending: ((status: Scripted) => void)[];
  findAccount(accountId: string): Promise<AccountLookup>;
  settle(index: number, status: Scripted): void;
}

/** A directory whose every lookup stays pending until the test settles it. */
function createDeferredDirectory(): DeferredDirectory {
  const pending: ((status: Scripted) => void)[] = [];

  return {
    pending,
    findAccount(accountId: string): Promise<AccountLookup> {
      return new Promise<AccountLookup>((resolve) => {
        pending.push((status: Scripted): void => {
          if (status === "missing" || status === "unavailable") {
            resolve({ outcome: status });

            return;
          }

          resolve({
            outcome: "found",
            account: {
              id: accountId,
              email: "ann@desk.io",
              displayName: "Ann Lee",
              access: "user",
              status,
              createdAt: 0,
              sessionsNotBefore: null,
            },
          });
        });
      });
    },
    settle(index: number, status: Scripted): void {
      pending[index]?.(status);
    },
  };
}
