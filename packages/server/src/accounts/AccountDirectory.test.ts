import { describe, expect, it } from "vitest";

import { deriveAccountStatus } from "#/accounts/AccountDirectory";

describe("deriveAccountStatus", () => {
  it("is active only when confirmed, approved and not blocked", () => {
    expect(
      deriveAccountStatus({ confirmed: true, approved: true, blocked: false }),
    ).toBe("active");
  });

  it("is pending when confirmed but not approved", () => {
    expect(
      deriveAccountStatus({ confirmed: true, approved: false, blocked: false }),
    ).toBe("pending");
  });

  it("is unconfirmed before the email is confirmed, even if approved", () => {
    expect(
      deriveAccountStatus({ confirmed: false, approved: true, blocked: false }),
    ).toBe("unconfirmed");
  });

  it("blocked wins over everything", () => {
    expect(
      deriveAccountStatus({ confirmed: true, approved: true, blocked: true }),
    ).toBe("blocked");
    expect(
      deriveAccountStatus({ confirmed: false, approved: false, blocked: true }),
    ).toBe("blocked");
  });
});
