import { describe, expect, it } from "vitest";

import {
  isAccountAdminAnswerDto,
  isAccountIdPayload,
  isAccountRenamePayload,
} from "#/protocol/accountAdmin.js";

const ID = "0b8f2c1e-4a7d-4c55-9e0a-6d1f3b2a9c10";

describe("isAccountIdPayload", () => {
  it("accepts a UUID", () => {
    expect(isAccountIdPayload({ accountId: ID })).toBe(true);
  });

  it.each([
    ["x", "x"],
    ["empty", ""],
    ["37 characters", `${ID}0`],
    ["uppercase", ID.toUpperCase()],
  ])("refuses %s", (_label: string, accountId: string) => {
    expect(isAccountIdPayload({ accountId })).toBe(false);
  });

  it("refuses a non-object and a missing id", () => {
    expect(isAccountIdPayload(null)).toBe(false);
    expect(isAccountIdPayload({})).toBe(false);
  });
});

describe("isAccountRenamePayload", () => {
  it("accepts an id with a name", () => {
    expect(isAccountRenamePayload({ accountId: ID, displayName: "Ann" })).toBe(
      true,
    );
  });

  it("refuses a missing name", () => {
    expect(isAccountRenamePayload({ accountId: ID })).toBe(false);
  });

  it("refuses a name over 200 UTF-16 units and accepts 200", () => {
    expect(
      isAccountRenamePayload({ accountId: ID, displayName: "a".repeat(200) }),
    ).toBe(true);
    expect(
      isAccountRenamePayload({ accountId: ID, displayName: "a".repeat(201) }),
    ).toBe(false);
  });

  it("refuses a bad id", () => {
    expect(isAccountRenamePayload({ accountId: "x", displayName: "Ann" })).toBe(
      false,
    );
  });
});

describe("isAccountAdminAnswerDto", () => {
  it("accepts a list, done and a refusal", () => {
    expect(
      isAccountAdminAnswerDto({
        accounts: [
          {
            id: ID,
            email: "a@b.co",
            displayName: "Ann",
            access: "user",
            status: "active",
            joinedAt: 1,
            isSelf: false,
          },
        ],
      }),
    ).toBe(true);
    expect(isAccountAdminAnswerDto({ accounts: [] })).toBe(true);
    expect(isAccountAdminAnswerDto({ done: true })).toBe(true);
    expect(isAccountAdminAnswerDto({ error: "forbidden" })).toBe(true);
  });

  it("refuses an unknown refusal word and other shapes", () => {
    expect(isAccountAdminAnswerDto({ error: "nope" })).toBe(false);
    expect(isAccountAdminAnswerDto({ done: false })).toBe(false);
    expect(isAccountAdminAnswerDto(null)).toBe(false);
    expect(isAccountAdminAnswerDto({ accounts: [{ id: ID }] })).toBe(false);
  });
});
