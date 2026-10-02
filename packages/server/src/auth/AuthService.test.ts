import { describe, expect, it } from "vitest";

import { AuthService, parseAuthUsers } from "#/auth/AuthService";

describe("AuthService", () => {
  it("issues a token + profile on valid credentials", async () => {
    const r = await svc.login("demo", "localpass");

    if (r === null) {
      throw new Error("expected login to succeed");
    }

    expect(r.user.name).toBe("Demo Operator");
    expect(svc.verifyToken(r.token)).toEqual({ username: "demo" });
  });

  it("rejects a wrong password", async () => {
    expect(await svc.login("demo", "nope")).toBeNull();
  });

  it("rejects a username in the roster but not configured with a password", async () => {
    expect(await svc.login("tchalla", "x")).toBeNull(); // no cred in AUTH_USERS
  });

  it("does not block the event loop while hashing: an immediate fires during login (S5)", async () => {
    // The one real-timer wait the test strategy allows: a single
    // earlier-deadline `setImmediate`. With `scryptSync` the immediate
    // cannot run before `login` returns, so this is RED on a sync hash.
    let ticked = false;
    setImmediate(() => {
      ticked = true;
    });

    await svc.login("demo", "localpass");

    expect(ticked).toBe(true);
  });

  it("hashes for an unknown username too, so timing cannot tell it from a known one (S5)", async () => {
    // Same witness as above: had the unknown-username path returned before
    // hashing, nothing would have left the event loop and the immediate
    // could not have fired before `login` resolved.
    let ticked = false;
    setImmediate(() => {
      ticked = true;
    });

    expect(await svc.login("nobody", "x")).toBeNull();
    expect(ticked).toBe(true);
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

  it("refuses a credential whose username is not in the roster", async () => {
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

    expect(await ghost.login("ghost", "correct-horse")).toBeNull();
  });

  it("falls back to the wall clock when no clock is injected", async () => {
    // Every other spec injects `now`, leaving the production default — the one
    // that actually stamps real tokens' expiry — unexercised.
    const before = Date.now();
    const wallClock = new AuthService({
      secret: "s",
      ttlMs: 60_000,
      credentials: parseAuthUsers("demo:localpass"),
    });

    const result = await wallClock.login("demo", "localpass");

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

const svc = new AuthService({
  secret: "s",
  ttlMs: 60_000,
  credentials: parseAuthUsers("demo:localpass,astark:hunter2"),
  now: (): number => {
    return 1_000_000;
  },
});
