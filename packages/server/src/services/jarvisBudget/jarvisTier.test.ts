import { describe, expect, it, vi } from "vitest";

import { JARVIS_BRAINS } from "@rtc/domain";

import type {
  AccountDirectory,
  AccountLookup,
  AccountRecord,
} from "#/accounts/AccountDirectory.js";

import { createTierLookup, houseBrainsFor } from "./jarvisTier.js";

describe("houseBrainsFor", () => {
  it("offers a member scripted, Haiku and Sonnet, never Opus", () => {
    expect(houseBrainsFor("member")).toEqual([
      "scripted",
      "claude-haiku-4-5",
      "claude-sonnet-5",
    ]);
  });

  it("offers an operator every brain", () => {
    expect(houseBrainsFor("operator")).toEqual(JARVIS_BRAINS);
  });
});

describe("createTierLookup", () => {
  it("makes a roster persona an operator without asking the directory", async () => {
    const directory = createStubDirectory(
      Promise.resolve({ outcome: "missing" }),
    );

    await expect(
      createTierLookup(directory)({
        username: "ops",
        accountId: null,
        issuedAt: null,
      }),
    ).resolves.toBe("operator");
    expect(directory.findAccount).not.toHaveBeenCalled();
  });

  it("makes an admin account an operator, reading it by its id", async () => {
    const directory = createStubDirectory(
      Promise.resolve({
        outcome: "found",
        account: createAccountRecord("admin"),
      }),
    );

    await expect(createTierLookup(directory)(ACCOUNT_CALLER)).resolves.toBe(
      "operator",
    );
    expect(directory.findAccount).toHaveBeenCalledWith("acc-1");
  });

  it("makes a user account a member", async () => {
    const directory = createStubDirectory(
      Promise.resolve({
        outcome: "found",
        account: createAccountRecord("user"),
      }),
    );

    await expect(createTierLookup(directory)(ACCOUNT_CALLER)).resolves.toBe(
      "member",
    );
  });

  it.each(["missing", "unavailable"] as const)(
    "makes an account the directory answers %s for a member",
    async (outcome) => {
      const directory = createStubDirectory(Promise.resolve({ outcome }));

      await expect(createTierLookup(directory)(ACCOUNT_CALLER)).resolves.toBe(
        "member",
      );
    },
  );

  it("makes an account a member when the directory throws", async () => {
    const directory = createStubDirectory(
      Promise.reject(new Error("socket hang up")),
    );

    await expect(createTierLookup(directory)(ACCOUNT_CALLER)).resolves.toBe(
      "member",
    );
  });
});

const ACCOUNT_CALLER = {
  username: "ada@example.com",
  accountId: "acc-1",
  issuedAt: 1,
};

function createStubDirectory(
  lookup: Promise<AccountLookup>,
): Pick<AccountDirectory, "findAccount"> {
  // A rejection created up front must not count as unhandled before the
  // lookup awaits it.
  lookup.catch(() => {
    return undefined;
  });

  return {
    findAccount: vi.fn(() => {
      return lookup;
    }),
  };
}

function createAccountRecord(access: AccountRecord["access"]): AccountRecord {
  return {
    id: "acc-1",
    email: "ada@example.com",
    displayName: "Ada",
    access,
    status: "active",
    createdAt: 0,
    sessionsNotBefore: null,
  };
}
