import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AccountStatus } from "@rtc/domain";

import type { AccountLookup } from "#/accounts/AccountDirectory";
import {
  type CachedAccount,
  createAccountStatusCache,
} from "#/accounts/accountStatusCache";
import { createRevocationLedger } from "#/accounts/revocationLedger";
import {
  createSessionRegistry,
  type SessionRegistry,
} from "#/accounts/sessionRegistry";
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
    ).toEqual({
      ok: true,
      status: 200,
      caller: { username: "demo", accountId: null, issuedAt: null },
    });
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

  it("admits a live registered account with its caller and no sessionEnded", async () => {
    const deps = createDeps({ status: "active" });

    expect(
      await decideUpgrade(`/?access=${createAccountToken()}`, "1.2.3.4", deps),
    ).toEqual({
      ok: true,
      status: 200,
      caller: { username: "ann@desk.io", accountId: "acc-1", issuedAt: NOW },
      revocationEpoch: 0,
    });
    expect(deps.asked).toEqual(["acc-1"]);
  });

  it.each(["blocked", "pending", "unconfirmed", "missing"] as const)(
    "accepts a still-valid token of a %s account and marks its session ended",
    async (status) => {
      const deps = createDeps({ status });

      expect(
        await decideUpgrade(
          `/?access=${createAccountToken()}`,
          "1.2.3.4",
          deps,
        ),
      ).toEqual({
        ok: true,
        status: 200,
        sessionEnded: true,
        revocationEpoch: 0,
        caller: { username: "ann@desk.io", accountId: "acc-1", issuedAt: NOW },
      });
    },
  );

  it("carries the epoch read BEFORE the status lookup, so a revocation during the lookup is visible later", async () => {
    const deps = createDeps({ status: "active" });
    let release: (account: CachedAccount) => void = ignoreCall;
    const lookup = new Promise<CachedAccount>((resolve) => {
      release = resolve;
    });

    const pending = decideUpgrade(
      `/?access=${createAccountToken()}`,
      "1.2.3.4",
      {
        ...deps,
        accountStatus: {
          read: (): Promise<CachedAccount> => {
            return lookup;
          },
          invalidate: ignoreCall,
        },
      },
    );

    deps.sessions.closeAll("acc-1");
    release({ status: "active", sessionsNotBefore: null });

    const verdict = await pending;

    expect(verdict.revocationEpoch).toBe(0);
    expect(deps.sessions.epochOf("acc-1")).toBeGreaterThan(0);
  });

  it("marks a token with no issued-at as ended", async () => {
    const deps = createDeps({ status: "active" });
    const legacy = signLegacyAccountToken();

    expect(
      await decideUpgrade(`/?access=${legacy}`, "1.2.3.4", deps),
    ).toMatchObject({ ok: true, sessionEnded: true });
  });

  it("marks a token issued before the account's stamp as ended, and one issued at the stamp as live", async () => {
    const before = createDeps({ status: "active", sessionsNotBefore: NOW + 1 });
    const at = createDeps({ status: "active", sessionsNotBefore: NOW });

    expect(
      await decideUpgrade(
        `/?access=${createAccountToken()}`,
        "1.2.3.4",
        before,
      ),
    ).toMatchObject({ ok: true, sessionEnded: true });
    expect(
      (await decideUpgrade(`/?access=${createAccountToken()}`, "1.2.3.4", at))
        .sessionEnded,
    ).toBeUndefined();
  });

  it("marks a token issued before the ledger's stamp as ended", async () => {
    const deps = createDeps({ status: "active" });
    deps.revocations.record("acc-1", NOW + 1);

    expect(
      await decideUpgrade(`/?access=${createAccountToken()}`, "1.2.3.4", deps),
    ).toMatchObject({ ok: true, sessionEnded: true });
  });

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

  it("re-checks the total cap after the awaited status too", async () => {
    const deps = createDeps({ status: "active", maxTotal: 1 });
    const pending = decideUpgrade(
      `/?access=${createAccountToken()}`,
      "1.2.3.4",
      deps,
    );

    deps.connections.acquire("9.9.9.9");

    expect(await pending).toEqual({
      ok: false,
      status: 503,
      reason: "too-many-connections",
    });
  });

  it("fails closed with 503 when the directory behind the cache rejects", async () => {
    const deps = createDeps();
    const failing: UpgradeGateDeps = {
      ...deps,
      accountStatus: createAccountStatusCache({
        directory: {
          findAccount: (): Promise<AccountLookup> => {
            return Promise.reject(new Error("socket hang up"));
          },
        },
        ttlMs: 60_000,
        maxEntries: 10,
        now: (): number => {
          return NOW;
        },
      }),
    };

    expect(
      await decideUpgrade(
        `/?access=${createAccountToken()}`,
        "1.2.3.4",
        failing,
      ),
    ).toEqual({ ok: false, status: 503, reason: "accounts-unavailable" });
  });
});

const SECRET = "s";
const NOW = 1_000;

interface GateOverrides {
  readonly maxPerIp?: number;
  readonly maxTotal?: number;
  readonly status?: AccountStatus | "missing" | "unavailable";
  readonly sessionsNotBefore?: number;
}

interface GateFixture extends UpgradeGateDeps {
  readonly sessions: SessionRegistry;
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
      read: (accountId: string): Promise<CachedAccount> => {
        asked.push(accountId);

        const status = overrides.status ?? "active";

        return Promise.resolve(
          status === "missing" || status === "unavailable"
            ? { status }
            : {
                status,
                sessionsNotBefore: overrides.sessionsNotBefore ?? null,
              },
        );
      },
      invalidate: (): void => {},
    },
    revocations: createRevocationLedger(10),
    sessions: createSessionRegistry(),
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

/** An account token minted before B2c: both claims, no `iat`. */
function signLegacyAccountToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      u: "ann@desk.io",
      exp: NOW + 60_000,
      id: "acc-1",
      a: "user",
    }),
  ).toString("base64url");

  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

function ignoreCall(): void {
  // A stand-in for a callback this test never needs.
}
