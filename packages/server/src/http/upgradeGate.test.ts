import { describe, expect, it, vi } from "vitest";

import type { CachedStatus } from "#/accounts/accountStatusCache";
import { AuthService, parseAuthUsers } from "#/auth/AuthService";
import { createBanList } from "#/auth/banList";
import { signToken } from "#/auth/token";
import { decideUpgrade, type UpgradeGateDeps } from "#/http/upgradeGate";
import { createConnectionGuard } from "#/socket/connectionGuard";

describe("decideUpgrade", () => {
  it("accepts a valid roster token without asking for an account status", async () => {
    const deps = createDeps();

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: true, status: 200 });
    expect(deps.asked).toEqual([]);
  });

  it("rejects a banned IP with 429 before looking at the token (Review Focus 4)", async () => {
    const deps = createDeps();
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    const verify = vi.spyOn(deps.auth, "verifyToken");

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: false, status: 429, reason: "banned" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects with 503 when the connection caps are hit, naming which", async () => {
    const perIp = createDeps({ maxPerIp: 1 });
    perIp.connections.acquire("1.2.3.4");

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", perIp),
    ).toEqual({ ok: false, status: 503, reason: "too-many-from-ip" });

    const total = createDeps({ maxTotal: 1 });
    total.connections.acquire("9.9.9.9");

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", total),
    ).toEqual({ ok: false, status: 503, reason: "too-many-connections" });
  });

  it("rejects a missing or bad token with 401 and the existing reasons", async () => {
    const deps = createDeps();

    expect(await decideUpgrade("/", "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "no-token",
    });
    expect(await decideUpgrade("/?access=nope", "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "invalid-token",
    });
    expect(await decideUpgrade(undefined, "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "no-url",
    });
  });

  it("accepts a registered account's token only while the account is active", async () => {
    const deps = createDeps({ status: "active" });

    expect(
      await decideUpgrade(`/?access=${createAccountToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: true, status: 200 });
    expect(deps.asked).toEqual(["acc-1"]);
  });

  it.each(["blocked", "pending", "unconfirmed", "missing"] as const)(
    "rejects a still-valid token of a %s account with 403",
    async (status) => {
      const deps = createDeps({ status });

      expect(
        await decideUpgrade(
          `/?access=${createAccountToken()}`,
          "1.2.3.4",
          deps,
        ),
      ).toEqual({ ok: false, status: 403, reason: "account-not-active" });
    },
  );

  it("fails closed with 503 when the account store is unavailable", async () => {
    const deps = createDeps({ status: "unavailable" });

    expect(
      await decideUpgrade(`/?access=${createAccountToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: false, status: 503, reason: "accounts-unavailable" });
  });

  it("re-checks the caps after the awaited status, so concurrent upgrades cannot overshoot", async () => {
    const deps = createDeps({ status: "active", maxPerIp: 1 });
    const pending = decideUpgrade(
      `/?access=${createAccountToken()}`,
      "1.2.3.4",
      deps,
    );

    // Another upgrade from the same IP completes while the status is awaited.
    deps.connections.acquire("1.2.3.4");

    expect(await pending).toEqual({
      ok: false,
      status: 503,
      reason: "too-many-from-ip",
    });
  });
});

const SECRET = "s";
const NOW = 1_000;

interface GateOverrides {
  readonly maxPerIp?: number;
  readonly maxTotal?: number;
  readonly status?: CachedStatus;
}

interface GateFixture extends UpgradeGateDeps {
  /** The account ids the gate asked a status for, in order. */
  readonly asked: string[];
}

function createDeps(overrides: GateOverrides = {}): GateFixture {
  const asked: string[] = [];

  return {
    asked,
    auth: new AuthService({
      secret: SECRET,
      ttlMs: 60_000,
      credentials: parseAuthUsers("demo:pw"),
      now: (): number => {
        return NOW;
      },
    }),
    banList: createBanList({
      strikesToBan: 5,
      strikeWindowMs: 60_000,
      banMs: 60_000,
      maxEntries: 10,
    }),
    connections: createConnectionGuard({
      maxTotal: overrides.maxTotal ?? 10,
      maxPerIp: overrides.maxPerIp ?? 10,
    }),
    accountStatus: {
      statusOf: (accountId: string): Promise<CachedStatus> => {
        asked.push(accountId);

        return Promise.resolve(overrides.status ?? "active");
      },
    },
    now: (): number => {
      return NOW;
    },
  };
}

/** A token signed the way a successful roster login would sign it. */
function createToken(): string {
  return signToken("demo", SECRET, 60_000, NOW);
}

/** A token signed the way a successful registered-account login would. */
function createAccountToken(): string {
  return signToken("ann@desk.io", SECRET, 60_000, NOW, {
    accountId: "acc-1",
    access: "user",
  });
}
