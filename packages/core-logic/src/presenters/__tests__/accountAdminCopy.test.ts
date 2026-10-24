import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ADMIN_COPY,
  describeAccountAdminRefusal,
  describePendingCount,
} from "#/presenters/accountAdminCopy";

describe("ACCOUNT_ADMIN_COPY", () => {
  it("spells the fixed lines exactly", () => {
    expect(ACCOUNT_ADMIN_COPY.panelTitle).toBe("Users");
    expect(ACCOUNT_ADMIN_COPY.empty).toBe("No registered accounts yet.");
    expect(ACCOUNT_ADMIN_COPY.forbidden).toBe("Administrator access required");
    expect(ACCOUNT_ADMIN_COPY.confirmDelete).toBe("Delete this account?");
    expect(ACCOUNT_ADMIN_COPY.you).toBe("You");
  });
});

describe("describePendingCount", () => {
  it("reads `n pending`", () => {
    expect(describePendingCount(3)).toBe("3 pending");
    expect(describePendingCount(0)).toBe("0 pending");
  });
});

describe("describeAccountAdminRefusal", () => {
  it("forbidden is the administrator-required line, whatever the action", () => {
    expect(describeAccountAdminRefusal("forbidden", "block")).toBe(
      "Administrator access required",
    );
    expect(describeAccountAdminRefusal("forbidden", "list")).toBe(
      "Administrator access required",
    );
  });

  it("names every other refusal in words, with no detail beyond the refusal", () => {
    expect(describeAccountAdminRefusal("self", "block")).toBe(
      "You cannot change your own account",
    );
    expect(describeAccountAdminRefusal("not_found", "delete")).toBe(
      "That account no longer exists",
    );
    expect(describeAccountAdminRefusal("invalid_name", "rename")).toBe(
      "That display name was not accepted",
    );
    expect(describeAccountAdminRefusal("unavailable", "approve")).toBe(
      "The live desk is unavailable right now. Try again shortly",
    );
    expect(describeAccountAdminRefusal("unavailable", "list")).toBe(
      "The account list could not be loaded. Try again shortly",
    );
  });
});
