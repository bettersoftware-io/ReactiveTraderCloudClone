import { describe, expect, it } from "vitest";

import { AuthService, parseAuthUsers } from "#/auth/AuthService";

const svc = new AuthService({
  secret: "s",
  ttlMs: 60_000,
  credentials: parseAuthUsers("demo:localpass,astark:hunter2"),
  now: (): number => {
    return 1_000_000;
  },
});

describe("AuthService", () => {
  it("issues a token + profile on valid credentials", () => {
    const r = svc.login("demo", "localpass");

    if (r === null) {
      throw new Error("expected login to succeed");
    }

    expect(r.user.name).toBe("Demo Operator");
    expect(svc.verifyToken(r.token)).toEqual({ username: "demo" });
  });

  it("rejects a wrong password", () => {
    expect(svc.login("demo", "nope")).toBeNull();
  });

  it("rejects a username in the roster but not configured with a password", () => {
    expect(svc.login("tchalla", "x")).toBeNull(); // no cred in AUTH_USERS
  });

  it("parseAuthUsers ignores blanks and trims", () => {
    const m = parseAuthUsers(" a:1 , b:2 ,");
    expect(m.get("a")).toBe("1");
    expect(m.get("b")).toBe("2");
    expect(m.size).toBe(2);
  });

  it("throws when constructed with an empty secret but configured users", () => {
    expect(() => {
      return new AuthService({
        secret: "",
        ttlMs: 60_000,
        credentials: parseAuthUsers("demo:x"),
      });
    }).toThrow("AUTH_SECRET must be set when AUTH_USERS is configured");
  });

  it("does not throw when constructed with a non-empty secret and configured users", () => {
    expect(() => {
      return new AuthService({
        secret: "s",
        ttlMs: 60_000,
        credentials: parseAuthUsers("demo:x"),
      });
    }).not.toThrow();
  });

  it("refuses a credential whose username is not in the roster", () => {
    // AUTH_USERS and the committed roster are two separate sources: the env
    // decides who may authenticate, the roster supplies the display user.
    // A username in one but not the other must fail CLOSED — issuing a token
    // with no user record would hand out a session the app cannot render.
    const ghost = new AuthService({
      secret: "s",
      ttlMs: 60_000,
      credentials: parseAuthUsers("ghost:correct-horse"),
      now: (): number => {
        return 1_000_000;
      },
    });

    expect(ghost.login("ghost", "correct-horse")).toBeNull();
  });

  it("falls back to the wall clock when no clock is injected", () => {
    // Every other spec injects `now`, leaving the production default — the one
    // that actually stamps real tokens' expiry — unexercised.
    const before = Date.now();
    const wallClock = new AuthService({
      secret: "s",
      ttlMs: 60_000,
      credentials: parseAuthUsers("demo:localpass"),
    });

    const result = wallClock.login("demo", "localpass");

    expect(result).not.toBeNull();

    const payload = JSON.parse(
      Buffer.from(result?.token.split(".")[0] ?? "", "base64url").toString(
        "utf8",
      ),
    ) as TokenPayload;

    expect(payload.exp).toBeGreaterThanOrEqual(before + 60_000);
    expect(payload.exp).toBeLessThanOrEqual(Date.now() + 60_000);
  });
});

interface TokenPayload {
  exp: number;
}
