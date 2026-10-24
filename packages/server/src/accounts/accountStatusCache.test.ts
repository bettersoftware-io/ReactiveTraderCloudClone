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

    expect((await cache.read("acc-1")).status).toBe("active");
    now = 60_999;
    expect((await cache.read("acc-1")).status).toBe("active");
    expect(lookups.calls).toBe(1);

    now = 61_000;
    expect((await cache.read("acc-1")).status).toBe("blocked");
    expect(lookups.calls).toBe(2);
  });

  it("caches a missing account as missing", async () => {
    const lookups = createLookups(["missing"]);
    const cache = createCache(lookups);

    expect((await cache.read("acc-1")).status).toBe("missing");
    expect((await cache.read("acc-1")).status).toBe("missing");
    expect(lookups.calls).toBe(1);
  });

  it("never caches unavailable — the next call asks again (Review Focus 5)", async () => {
    const lookups = createLookups(["unavailable", "active"]);
    const cache = createCache(lookups);

    expect((await cache.read("acc-1")).status).toBe("unavailable");
    expect((await cache.read("acc-1")).status).toBe("active");
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

    await cache.read("acc-1");
    await cache.read("acc-2");
    await cache.read("acc-3");

    // acc-1 was evicted, so it is looked up again.
    expect((await cache.read("acc-1")).status).toBe("blocked");
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

    expect((await cache.read("acc-1")).status).toBe("unavailable");
    expect((await cache.read("acc-1")).status).toBe("unavailable");
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

    expect((await cache.read("acc-1")).status).toBe("unavailable");
    expect((await cache.read("acc-1")).status).toBe("unavailable");
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

    const first = cache.read("acc-1");
    const second = cache.read("acc-1");
    expect(deferred.pending).toHaveLength(1);

    deferred.settle(0, "blocked");

    expect((await first).status).toBe("blocked");
    expect((await second).status).toBe("blocked");
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

    const first = cache.read("acc-1");
    deferred.settle(0, "unavailable");
    expect((await first).status).toBe("unavailable");

    const second = cache.read("acc-1");
    expect(deferred.pending).toHaveLength(2);
    deferred.settle(1, "active");
    expect((await second).status).toBe("active");
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

    const one = cache.read("acc-1");
    deferred.settle(0, "active");
    await one;

    const other = cache.read("acc-2");
    expect(deferred.pending).toHaveLength(2);
    deferred.settle(1, "blocked");
    expect((await other).status).toBe("blocked");

    expect((await cache.read("acc-1")).status).toBe("active");
    expect(deferred.pending).toHaveLength(2);
  });
  it("carries the account's sessionsNotBefore stamp", async () => {
    const cache = createAccountStatusCache({
      directory: {
        findAccount: (accountId: string): Promise<AccountLookup> => {
          return Promise.resolve({
            outcome: "found",
            account: {
              id: accountId,
              email: "ann@desk.io",
              displayName: "Ann Lee",
              access: "user",
              status: "active",
              createdAt: 0,
              sessionsNotBefore: 5_000,
            },
          });
        },
      },
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return 1_000;
      },
    });

    expect(await cache.read("acc-1")).toEqual({
      status: "active",
      sessionsNotBefore: 5_000,
    });
  });

  it("invalidate makes the next read ask the directory again", async () => {
    const lookups = createLookups(["active", "blocked"]);
    const cache = createCache(lookups);

    expect((await cache.read("acc-1")).status).toBe("active");
    cache.invalidate("acc-1");
    expect((await cache.read("acc-1")).status).toBe("blocked");
    expect(lookups.calls).toBe(2);
  });

  it("does not remember a lookup that an invalidation overtook (Review Focus 2)", async () => {
    const deferred = createDeferredDirectory();
    const cache = createCache(deferred);

    const stale = cache.read("acc-1");
    cache.invalidate("acc-1");
    deferred.settle(0, "active");

    // The caller that started it still gets its answer...
    expect((await stale).status).toBe("active");

    // ...but it was not cached: the next read goes to the directory.
    const fresh = cache.read("acc-1");
    expect(deferred.pending).toHaveLength(2);
    deferred.settle(1, "blocked");
    expect((await fresh).status).toBe("blocked");
  });

  it("an old lookup's settling does not drop the in-flight lookup started after the invalidation", async () => {
    const deferred = createDeferredDirectory();
    const cache = createCache(deferred);

    const old = cache.read("acc-1");
    cache.invalidate("acc-1");
    const fresh = cache.read("acc-1");
    expect(deferred.pending).toHaveLength(2);

    deferred.settle(0, "active");
    await old;

    // A third concurrent read shares the fresh lookup: two calls, not three.
    const third = cache.read("acc-1");
    expect(deferred.pending).toHaveLength(2);

    deferred.settle(1, "blocked");
    expect((await fresh).status).toBe("blocked");
    expect((await third).status).toBe("blocked");
    expect((await cache.read("acc-1")).status).toBe("blocked");
    expect(deferred.pending).toHaveLength(2);
  });

  it("a lookup started after an invalidation is remembered even when an older one settles later", async () => {
    const deferred = createDeferredDirectory();
    const cache = createCache(deferred);

    const old = cache.read("acc-1");
    cache.invalidate("acc-1");
    const fresh = cache.read("acc-1");

    deferred.settle(1, "blocked");
    await fresh;
    deferred.settle(0, "active");
    await old;

    expect((await cache.read("acc-1")).status).toBe("blocked");
    expect(deferred.pending).toHaveLength(2);
  });

  it("invalidating an account nothing is known of is harmless", async () => {
    const lookups = createLookups(["active"]);
    const cache = createCache(lookups);

    cache.invalidate("acc-9");
    expect((await cache.read("acc-1")).status).toBe("active");
    expect(lookups.calls).toBe(1);
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
  lookups: Pick<ScriptedLookups, "findAccount">,
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
