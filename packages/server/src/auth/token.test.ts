import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "#/auth/token";

const SECRET = "test-secret";
const NOW = 1_000_000;

describe("token", () => {
  it("round-trips a valid, unexpired token", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, SECRET, NOW + 30_000)).toEqual({ username: "demo" });
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
});
