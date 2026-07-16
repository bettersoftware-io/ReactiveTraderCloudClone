import { describe, expect, it } from "vitest";

import { AuthService, parseAuthUsers } from "#/auth/AuthService";

const svc = new AuthService({
  secret: "s",
  ttlMs: 60_000,
  credentials: parseAuthUsers("demo:localpass,astark:hunter2"),
  now: (): number => 1_000_000,
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
});
