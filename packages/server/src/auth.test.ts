import { describe, expect, it } from "vitest";

import { isAuthorizedUpgrade } from "./auth.js";

describe("isAuthorizedUpgrade", () => {
  it("is open when no token configured (local dev / e2e)", () => {
    expect(isAuthorizedUpgrade("/", undefined)).toBe(true);
    expect(isAuthorizedUpgrade("/?access=anything", "")).toBe(true);
  });

  it("accepts a matching access token", () => {
    expect(isAuthorizedUpgrade("/?access=s3cret", "s3cret")).toBe(true);
  });

  it("rejects a missing or wrong token when one is required", () => {
    expect(isAuthorizedUpgrade("/", "s3cret")).toBe(false);
    expect(isAuthorizedUpgrade("/?access=nope", "s3cret")).toBe(false);
    expect(isAuthorizedUpgrade(undefined, "s3cret")).toBe(false);
  });
});
