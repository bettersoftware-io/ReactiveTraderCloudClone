import { describe, expect, it } from "vitest";

import type { AccountLookup, AccountStatus } from "#/accounts/AccountDirectory";
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
