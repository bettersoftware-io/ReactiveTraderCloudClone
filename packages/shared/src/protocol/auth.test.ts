import { describe, expect, it } from "vitest";

import {
  isAccountErrorDto,
  isAccountFlowResponseDto,
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
  it("isRegisterRequestDto needs an email and a display name, no password", () => {
    expect(
      isRegisterRequestDto({ email: "ann@desk.io", displayName: "Ann" }),
    ).toBe(true);
    expect(isRegisterRequestDto({ email: "ann@desk.io", password: "x" })).toBe(
      false,
    );
    expect(isRegisterRequestDto({ email: 1, displayName: "Ann" })).toBe(false);
  });

  it("isEmailRequestDto needs a string email", () => {
    expect(isEmailRequestDto({ email: "ann@desk.io" })).toBe(true);
    expect(isEmailRequestDto({})).toBe(false);
    expect(isEmailRequestDto(null)).toBe(false);
  });

  it("isConfirmEmailRequestDto needs email, code and the password to set", () => {
    expect(
      isConfirmEmailRequestDto({
        email: "ann@desk.io",
        code: "00000000",
        password: "x",
      }),
    ).toBe(true);
    expect(
      isConfirmEmailRequestDto({ email: "ann@desk.io", code: "00000000" }),
    ).toBe(false);
    expect(isConfirmEmailRequestDto({ email: "ann@desk.io" })).toBe(false);
  });

  it("isResetPasswordRequestDto needs email, code and password", () => {
    expect(
      isResetPasswordRequestDto({
        email: "ann@desk.io",
        code: "00000000",
        password: "x",
      }),
    ).toBe(true);
    expect(
      isResetPasswordRequestDto({ email: "ann@desk.io", code: "00000000" }),
    ).toBe(false);
  });
});

describe("account request guards reject non-objects and wrong types", () => {
  const guards: readonly [string, (value: unknown) => boolean, object][] = [
    [
      "isRegisterRequestDto",
      isRegisterRequestDto,
      { email: "a@b.io", displayName: "Ann" },
    ],
    ["isEmailRequestDto", isEmailRequestDto, { email: "a@b.io" }],
    [
      "isConfirmEmailRequestDto",
      isConfirmEmailRequestDto,
      { email: "a@b.io", code: "00000000", password: "x" },
    ],
    [
      "isResetPasswordRequestDto",
      isResetPasswordRequestDto,
      { email: "a@b.io", code: "00000000", password: "x" },
    ],
  ];

  it.each(guards)(
    "%s refuses a string, an array and null",
    (_name: string, guard: (value: unknown) => boolean) => {
      expect(guard("a@b.io")).toBe(false);
      expect(guard([])).toBe(false);
      expect(guard(null)).toBe(false);
    },
  );

  it.each(guards)(
    "%s refuses a numeric field",
    (_name: string, guard: (value: unknown) => boolean, valid: object) => {
      expect(guard(valid)).toBe(true);
      expect(guard({ ...valid, email: 1 })).toBe(false);
    },
  );
});

describe("isAccountFlowResponseDto", () => {
  it("accepts a status word and rejects anything else", () => {
    expect(isAccountFlowResponseDto({ status: "code_sent" })).toBe(true);
    expect(isAccountFlowResponseDto({ status: "ok" })).toBe(false);
    expect(isAccountFlowResponseDto(null)).toBe(false);
  });
});

describe("isAccountErrorDto", () => {
  it("accepts an error string with an absent or string rule", () => {
    expect(isAccountErrorDto({ error: "invalid_request", rule: "email" })).toBe(
      true,
    );
    expect(isAccountErrorDto({ error: "rate_limited" })).toBe(true);
  });

  it("rejects a non-string error or rule", () => {
    expect(isAccountErrorDto({ error: 4 })).toBe(false);
    expect(isAccountErrorDto({ error: "x", rule: 3 })).toBe(false);
    expect(isAccountErrorDto(null)).toBe(false);
  });
});
