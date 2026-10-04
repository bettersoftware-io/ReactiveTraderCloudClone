import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "#/auth/token";

describe("token", () => {
  it("round-trips a valid, unexpired token", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, SECRET, NOW + 30_000)).toEqual({
      username: "demo",
      accountId: null,
      access: "user",
    });
  });

  it("round-trips the account id and access level", () => {
    const t = signToken("ann@desk.io", SECRET, 60_000, NOW, {
      accountId: "acc-1",
      access: "admin",
    });

    expect(verifyToken(t, SECRET, NOW)).toEqual({
      username: "ann@desk.io",
      accountId: "acc-1",
      access: "admin",
    });
  });

  it("rejects an access claim with no account id (a half-claim)", () => {
    const payload = JSON.stringify({ u: "demo", exp: 9e15, a: "admin" });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });

  it("rejects an account id with no access claim", () => {
    const payload = JSON.stringify({ u: "demo", exp: 9e15, id: "acc-1" });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });

  it("rejects an empty-string account id", () => {
    const payload = JSON.stringify({
      u: "demo",
      exp: 9e15,
      id: "",
      a: "user",
    });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });

  it("rejects a non-string account id with a valid access level", () => {
    const payload = JSON.stringify({
      u: "demo",
      exp: 9e15,
      id: 1,
      a: "admin",
    });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });

  it("rejects an access level it does not know", () => {
    const payload = JSON.stringify({
      u: "demo",
      exp: 9e15,
      id: "acc-1",
      a: "root",
    });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });
  it("rejects after expiry", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, SECRET, NOW + 61_000)).toBeNull();
  });
  it("rejects a tampered payload", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    const [, sig] = t.split(".");
    const forged = `${Buffer.from('{"u":"admin","exp":9e15}').toString("base64url")}.${sig}`;
    expect(verifyToken(forged, SECRET, NOW)).toBeNull();
  });
  it("rejects a wrong secret", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, "other-secret", NOW)).toBeNull();
  });

  // The tampered-payload case above is caught by the signature check, so the
  // payload SHAPE checks past it were never reached. These forge tokens that
  // are correctly signed but structurally wrong — the only way in, and the
  // shape an attacker with the secret (or a future format change) produces.
  it("rejects a validly-signed payload missing its fields", () => {
    expect(verifyToken(forge("{}"), SECRET, NOW)).toBeNull();
  });

  it("rejects a validly-signed payload with mistyped fields", () => {
    // exp as a string sails through JSON.parse and would compare `"9e15" > now`
    // as a string/number coercion — the typeof guard is what stops it.
    expect(
      verifyToken(forge('{"u":"demo","exp":"9e15"}'), SECRET, NOW),
    ).toBeNull();
  });

  it("rejects a validly-signed payload that is not JSON at all", () => {
    expect(verifyToken(forge("not json"), SECRET, NOW)).toBeNull();
  });
});

/** Builds a token whose signature is genuine for its payload, so verification
 * reaches the parse/shape checks instead of failing at the HMAC compare. */
function forge(payload: string): string {
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(encoded).digest("base64url");

  return `${encoded}.${sig}`;
}

const SECRET = "test-secret";

const NOW = 1_000_000;
