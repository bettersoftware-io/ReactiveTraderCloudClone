import { describe, expect, it, vi } from "vitest";

import { AuthService, parseAuthUsers } from "#/auth/AuthService";
import { createBanList } from "#/auth/banList";
import { signToken } from "#/auth/token";
import { decideUpgrade, type UpgradeGateDeps } from "#/http/upgradeGate";
import { createConnectionGuard } from "#/socket/connectionGuard";

describe("decideUpgrade", () => {
  it("accepts a valid token from an unbanned IP with free capacity", () => {
    const deps = createDeps();
    const url = `/?access=${createToken()}`;

    expect(decideUpgrade(url, "1.2.3.4", deps)).toEqual({
      ok: true,
      status: 200,
    });
  });

  it("rejects a banned IP with 429 before looking at the token (Review Focus 4)", () => {
    const deps = createDeps();
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    const verify = vi.spyOn(deps.auth, "verifyToken");

    expect(decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", deps)).toEqual(
      { ok: false, status: 429, reason: "banned" },
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects with 503 when the connection caps are hit, naming which", () => {
    const perIp = createDeps({ maxPerIp: 1 });
    perIp.connections.acquire("1.2.3.4");

    expect(
      decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", perIp),
    ).toEqual({ ok: false, status: 503, reason: "too-many-from-ip" });

    const total = createDeps({ maxTotal: 1 });
    total.connections.acquire("9.9.9.9");

    expect(
      decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", total),
    ).toEqual({ ok: false, status: 503, reason: "too-many-connections" });
  });

  it("rejects a missing or bad token with 401 and the existing reasons", () => {
    const deps = createDeps();

    expect(decideUpgrade("/", "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "no-token",
    });
    expect(decideUpgrade("/?access=nope", "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "invalid-token",
    });
    expect(decideUpgrade(undefined, "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "no-url",
    });
  });
});

const SECRET = "s";
const NOW = 1_000;

interface CapOverrides {
  readonly maxPerIp?: number;
  readonly maxTotal?: number;
}

function createDeps(limits: CapOverrides = {}): UpgradeGateDeps {
  return {
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
      maxTotal: limits.maxTotal ?? 10,
      maxPerIp: limits.maxPerIp ?? 10,
    }),
    now: (): number => {
      return NOW;
    },
  };
}

/** A token signed the way a successful login would sign it — the token
 * module directly, so the gate tests stay free of the async hash. */
function createToken(): string {
  return signToken("demo", SECRET, 60_000, NOW);
}
