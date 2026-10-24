import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ACTION_PROGRESS_LABELS,
  ACCOUNT_ADMIN_COLUMNS,
  ACCOUNT_ADMIN_COPY,
  describeAccountAdminRefusal,
  describePendingCount,
  describeRowActionLabel,
  describeRowActionText,
  formatJoinedDate,
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

describe("ACCOUNT_ADMIN_COLUMNS", () => {
  it("names the four columns", () => {
    expect(ACCOUNT_ADMIN_COLUMNS).toEqual({
      name: "Name",
      email: "Email",
      joined: "Joined",
      status: "Status",
    });
  });
});

describe("ACCOUNT_ACTION_PROGRESS_LABELS", () => {
  it("reads each action in progress", () => {
    expect(ACCOUNT_ACTION_PROGRESS_LABELS).toEqual({
      approve: "Approving…",
      block: "Blocking…",
      unblock: "Unblocking…",
      rename: "Renaming…",
      delete: "Deleting…",
    });
  });
});

describe("describeRowActionText", () => {
  it("reads every row button's label", () => {
    expect(describeRowActionText("approve")).toBe("Approve");
    expect(describeRowActionText("confirm")).toBe("Confirm");
    expect(describeRowActionText("dismiss")).toBe("Dismiss");
  });

  it("reads an account action in progress when busy", () => {
    expect(describeRowActionText("block", true)).toBe("Blocking…");
    expect(describeRowActionText("delete", true)).toBe("Deleting…");
  });

  it("keeps a control's own label when busy, since only an account action runs", () => {
    expect(describeRowActionText("save", true)).toBe("Save");
    expect(describeRowActionText("cancel", true)).toBe("Cancel");
  });
});

describe("describeRowActionLabel", () => {
  it("names the account the button acts on after its label", () => {
    expect(describeRowActionLabel("approve", "Ann Lee")).toBe(
      "Approve Ann Lee",
    );
    expect(describeRowActionLabel("confirm", "Ann Lee")).toBe(
      "Confirm Ann Lee",
    );
  });

  it("names the account after the in-progress label when busy", () => {
    expect(describeRowActionLabel("unblock", "Ann Lee", true)).toBe(
      "Unblocking… Ann Lee",
    );
  });
});

describe("formatJoinedDate", () => {
  it("reads the UTC day as YYYY-MM-DD", () => {
    expect(formatJoinedDate(1_700_000_000_000)).toBe("2023-11-14");
  });

  it("keeps the UTC day at the edges of a day, whatever the local zone", () => {
    expect(formatJoinedDate(Date.UTC(2026, 0, 5, 0, 0, 0, 0))).toBe(
      "2026-01-05",
    );
    expect(formatJoinedDate(Date.UTC(2026, 0, 5, 23, 59, 59, 999))).toBe(
      "2026-01-05",
    );
  });

  it("pads a single-digit month and day", () => {
    expect(formatJoinedDate(Date.UTC(2026, 2, 7))).toBe("2026-03-07");
  });

  it("reads an instant no Date can hold as an empty cell", () => {
    expect(formatJoinedDate(Number.NaN)).toBe("");
    expect(formatJoinedDate(1e20)).toBe("");
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
