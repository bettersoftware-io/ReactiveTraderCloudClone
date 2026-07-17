import { describe, expect, it } from "vitest";

import { isLoginRequestDto } from "#/protocol/auth";

describe("isLoginRequestDto", () => {
  it("accepts a well-formed login body", () => {
    expect(isLoginRequestDto({ username: "demo", password: "x" })).toBe(true);
  });
  it("rejects missing/mistyped fields", () => {
    expect(isLoginRequestDto({ username: "demo" })).toBe(false);
    expect(isLoginRequestDto({ username: 1, password: "x" })).toBe(false);
    expect(isLoginRequestDto(null)).toBe(false);
  });
});
