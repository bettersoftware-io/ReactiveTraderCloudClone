import { describe, expect, it } from "vitest";

import {
  isConfirmEmailRequestDto,
  isEmailRequestDto,
  isLoginRequestDto,
  isRegisterRequestDto,
  isResetPasswordRequestDto,
} from "#/protocol/auth.js";

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

describe("account request guards", () => {
  it("isRegisterRequestDto needs three string fields", () => {
    expect(
      isRegisterRequestDto({
        email: "ann@desk.io",
        displayName: "Ann",
        password: "x",
      }),
    ).toBe(true);
    expect(isRegisterRequestDto({ email: "ann@desk.io", password: "x" })).toBe(
      false,
    );
    expect(
      isRegisterRequestDto({ email: 1, displayName: "Ann", password: "x" }),
    ).toBe(false);
  });

  it("isEmailRequestDto needs a string email", () => {
    expect(isEmailRequestDto({ email: "ann@desk.io" })).toBe(true);
    expect(isEmailRequestDto({})).toBe(false);
    expect(isEmailRequestDto(null)).toBe(false);
  });

  it("isConfirmEmailRequestDto needs email and code", () => {
    expect(
      isConfirmEmailRequestDto({ email: "ann@desk.io", code: "000000" }),
    ).toBe(true);
    expect(isConfirmEmailRequestDto({ email: "ann@desk.io" })).toBe(false);
  });

  it("isResetPasswordRequestDto needs email, code and password", () => {
    expect(
      isResetPasswordRequestDto({
        email: "ann@desk.io",
        code: "000000",
        password: "x",
      }),
    ).toBe(true);
    expect(
      isResetPasswordRequestDto({ email: "ann@desk.io", code: "000000" }),
    ).toBe(false);
  });
});
