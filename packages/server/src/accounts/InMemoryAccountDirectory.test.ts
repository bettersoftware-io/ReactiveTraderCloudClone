import { describe, expect, it } from "vitest";

import type {
  AccountDirectory,
  SignUpInput,
} from "#/accounts/AccountDirectory";
import {
  DEV_ACCOUNT_PASSWORD,
  DEV_ACCOUNT_SEEDS,
  type DevAccountSeed,
} from "#/accounts/devAccounts";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
  type PasswordHash,
} from "#/accounts/InMemoryAccountDirectory";
import { hashPassword } from "#/auth/passwordHash";

describe("InMemoryAccountDirectory", () => {
  it("a new sign-up has no password until the code sets one", async () => {
    const directory = createDirectory();

    expect(await directory.signUp(createSignUp("ann@desk.io"), IP)).toBe(
      "sent",
    );
    // No password exists yet, so every guess reads like an unknown address.
    expect(await directory.checkPassword("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "invalid",
    });
    expect(
      await directory.confirmEmail("ann@desk.io", "11111111", PASSWORD, IP),
    ).toBe("invalid_code");
    expect(await directory.checkPassword("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "invalid",
    });
    expect(
      await directory.confirmEmail(
        "ann@desk.io",
        DEV_CONFIRMATION_CODE,
        PASSWORD,
        IP,
      ),
    ).toBe("confirmed");

    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    expect(check.outcome).toBe("match");
  });

  it("confirming an already confirmed account never changes its password", async () => {
    const directory = createDirectory();

    expect(
      await directory.confirmEmail(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        "Taken2026!over",
        IP,
      ),
    ).toBe("invalid_code");
    expect(
      (
        await directory.checkPassword(
          "trader@rtc.test",
          DEV_ACCOUNT_PASSWORD,
          IP,
        )
      ).outcome,
    ).toBe("match");
    expect(
      (await directory.checkPassword("trader@rtc.test", "Taken2026!over", IP))
        .outcome,
    ).toBe("invalid");
  });

  it("a confirmed sign-up is pending, never active, with the user role", async () => {
    const directory = createDirectory();
    await createConfirmedAccount(directory, "ann@desk.io");
    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    if (check.outcome !== "match") {
      throw new Error("expected a match");
    }

    expect(await directory.findAccount(check.accountId)).toEqual({
      outcome: "found",
      account: {
        id: check.accountId,
        email: "ann@desk.io",
        displayName: "Ann Lee",
        access: "user",
        status: "pending",
        createdAt: 1_000,
        sessionsNotBefore: null,
      },
    });
  });

  it("signing up an existing address answers `sent` and changes nothing", async () => {
    const directory = createDirectory();
    await createConfirmedAccount(directory, "ann@desk.io");

    expect(
      await directory.signUp(
        { email: "ann@desk.io", displayName: "Mallory" },
        IP,
      ),
    ).toBe("sent");
    expect(
      (await directory.checkPassword("ann@desk.io", PASSWORD, IP)).outcome,
    ).toBe("match");
  });

  it("an unknown address and a wrong password read the same", async () => {
    const directory = createDirectory();

    expect(
      await directory.checkPassword("nobody@desk.io", PASSWORD, IP),
    ).toEqual({ outcome: "invalid" });
    expect(
      await directory.checkPassword("trader@rtc.test", "Wrong2026!pass", IP),
    ).toEqual({ outcome: "invalid" });
  });

  it("a reset needs a request first, then the code", async () => {
    const directory = createDirectory();
    const next = "Fresh2026!pass";

    expect(
      await directory.resetPassword(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        next,
        IP,
      ),
    ).toBe("invalid_code");

    await directory.requestReset("trader@rtc.test", IP);

    expect(
      await directory.resetPassword("trader@rtc.test", "11111111", next, IP),
    ).toBe("invalid_code");
    expect(
      await directory.resetPassword(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        next,
        IP,
      ),
    ).toMatchObject({
      outcome: "changed",
      accountId: expect.any(String),
    });
    expect(
      (await directory.checkPassword("trader@rtc.test", next, IP)).outcome,
    ).toBe("match");
    expect(
      (
        await directory.checkPassword(
          "trader@rtc.test",
          DEV_ACCOUNT_PASSWORD,
          IP,
        )
      ).outcome,
    ).toBe("invalid");
  });

  it("a reset of an unconfirmed account confirms it, as Supabase's recovery does", async () => {
    const directory = createDirectory();
    await directory.signUp(createSignUp("ann@desk.io"), IP);
    await directory.requestReset("ann@desk.io", IP);

    expect(
      await directory.resetPassword(
        "ann@desk.io",
        DEV_CONFIRMATION_CODE,
        PASSWORD,
        IP,
      ),
    ).toMatchObject({
      outcome: "changed",
      accountId: expect.any(String),
    });

    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    if (check.outcome !== "match") {
      throw new Error(`expected a match, got ${check.outcome}`);
    }

    const found = await directory.findAccount(check.accountId);

    expect(found.outcome === "found" && found.account.status).toBe("pending");
  });

  it("a confirmation whose hash fails is unavailable and changes nothing", async () => {
    const hash = createSwitchableHash();
    const directory = createDirectory(hash.hash);
    await directory.signUp(createSignUp("ann@desk.io"), IP);

    hash.failing = true;

    expect(
      await directory.confirmEmail(
        "ann@desk.io",
        DEV_CONFIRMATION_CODE,
        PASSWORD,
        IP,
      ),
    ).toBe("unavailable");

    hash.failing = false;

    // Still unconfirmed: the same code confirms on the next attempt.
    expect(
      await directory.confirmEmail(
        "ann@desk.io",
        DEV_CONFIRMATION_CODE,
        PASSWORD,
        IP,
      ),
    ).toBe("confirmed");
    expect(
      (await directory.checkPassword("ann@desk.io", PASSWORD, IP)).outcome,
    ).toBe("match");
  });

  it("a reset whose hash fails is unavailable and keeps the old password", async () => {
    const hash = createSwitchableHash();
    const directory = createDirectory(hash.hash);
    const next = "Fresh2026!pass";
    await directory.requestReset("trader@rtc.test", IP);

    hash.failing = true;

    expect(
      await directory.resetPassword(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        next,
        IP,
      ),
    ).toBe("unavailable");

    hash.failing = false;

    expect(
      (
        await directory.checkPassword(
          "trader@rtc.test",
          DEV_ACCOUNT_PASSWORD,
          IP,
        )
      ).outcome,
    ).toBe("match");
    // The request still stands: the next attempt changes the password.
    expect(
      await directory.resetPassword(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        next,
        IP,
      ),
    ).toMatchObject({
      outcome: "changed",
      accountId: expect.any(String),
    });
    expect(
      (await directory.checkPassword("trader@rtc.test", next, IP)).outcome,
    ).toBe("match");
  });

  it("a password check whose hash fails is unavailable, not a rejection", async () => {
    const hash = createSwitchableHash();
    const directory = createDirectory(hash.hash);

    hash.failing = true;

    await expect(
      directory.checkPassword("trader@rtc.test", DEV_ACCOUNT_PASSWORD, IP),
    ).resolves.toEqual({ outcome: "unavailable" });
    await expect(
      directory.checkPassword("nobody@desk.io", DEV_ACCOUNT_PASSWORD, IP),
    ).resolves.toEqual({ outcome: "unavailable" });
  });

  it("requesting a reset for an unknown address still answers `sent`", async () => {
    expect(await createDirectory().requestReset("nobody@desk.io", IP)).toBe(
      "sent",
    );
  });

  it("seeds one account per status, the admin included", async () => {
    const directory = createDirectory();
    const statuses = await Promise.all(
      DEV_ACCOUNT_SEEDS.map(async (seed) => {
        const found = await directory.findAccount(seed.id);

        return found.outcome === "found" ? found.account.status : "missing";
      }),
    );

    expect(statuses).toEqual(["active", "active", "pending", "blocked"]);
    expect(await directory.findAccount(DEV_ACCOUNT_SEEDS[0]?.id ?? "")).toEqual(
      {
        outcome: "found",
        account: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "admin@rtc.test",
          displayName: "Desk Admin",
          access: "admin",
          status: "active",
          createdAt: 1_000,
          sessionsNotBefore: null,
        },
      },
    );
  });

  it("two overlapping sign-ups for one address keep the first, whole", async () => {
    const directory = createDirectory();
    const [first, second] = await Promise.all([
      directory.signUp(createSignUp("ann@desk.io"), IP),
      directory.signUp({ email: "ann@desk.io", displayName: "Mallory" }, IP),
    ]);

    expect([first, second]).toEqual(["sent", "sent"]);

    await directory.confirmEmail(
      "ann@desk.io",
      DEV_CONFIRMATION_CODE,
      PASSWORD,
      IP,
    );
    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    expect(check.outcome).toBe("match");

    if (check.outcome !== "match") {
      throw new Error("expected a match");
    }

    const found = await directory.findAccount(check.accountId);

    expect(found.outcome === "found" && found.account.displayName).toBe(
      "Ann Lee",
    );
  });

  it("an existing address keeps its display name after a repeat sign-up", async () => {
    const directory = createDirectory();
    await createConfirmedAccount(directory, "ann@desk.io");
    await directory.signUp(
      { email: "ann@desk.io", displayName: "Mallory" },
      IP,
    );
    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    if (check.outcome !== "match") {
      throw new Error("expected a match");
    }

    const found = await directory.findAccount(check.accountId);

    expect(found.outcome === "found" && found.account.displayName).toBe(
      "Ann Lee",
    );
  });

  it("the seeded blocked account matches its password; the directory only reports `blocked`", async () => {
    const directory = createDirectory();
    const check = await directory.checkPassword(
      "blocked@rtc.test",
      DEV_ACCOUNT_PASSWORD,
      IP,
    );

    expect(check.outcome).toBe("match");

    if (check.outcome !== "match") {
      throw new Error("expected a match");
    }

    const found = await directory.findAccount(check.accountId);

    expect(found.outcome === "found" && found.account.status).toBe("blocked");
  });

  it("resending a code answers `sent` for a known and an unknown address", async () => {
    const directory = createDirectory();
    await directory.signUp(createSignUp("ann@desk.io"), IP);

    expect(await directory.resendCode("ann@desk.io", IP)).toBe("sent");
    expect(await directory.resendCode("nobody@desk.io", IP)).toBe("sent");
  });

  it("confirming with the right code is `invalid_code` for an unknown or already confirmed address", async () => {
    const directory = createDirectory();

    expect(
      await directory.confirmEmail(
        "nobody@desk.io",
        DEV_CONFIRMATION_CODE,
        PASSWORD,
        IP,
      ),
    ).toBe("invalid_code");
    expect(
      await directory.confirmEmail(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        PASSWORD,
        IP,
      ),
    ).toBe("invalid_code");
    expect(
      (await directory.checkPassword("nobody@desk.io", PASSWORD, IP)).outcome,
    ).toBe("invalid");
  });

  it("counts registrations since a moment, seeds excluded by their age", async () => {
    let now = 10_000;
    const directory = createInMemoryAccountDirectory({
      now: (): number => {
        return now;
      },
      seeds: DEV_ACCOUNT_SEEDS,
    });

    now = 50_000;
    await directory.signUp(createSignUp("ann@desk.io"), IP);

    expect(await directory.countRegistrationsSince(40_000)).toEqual({
      outcome: "counted",
      count: 1,
    });
  });

  it("findByEmail finds a seed and a sign-up, and is missing otherwise", async () => {
    const directory = createDirectory();
    await directory.signUp(createSignUp("ann@desk.io"), IP);

    expect(await directory.findByEmail("trader@rtc.test")).toMatchObject({
      outcome: "found",
      account: { status: "active" },
    });
    expect(await directory.findByEmail("ann@desk.io")).toMatchObject({
      outcome: "found",
      account: { status: "unconfirmed" },
    });
    expect(await directory.findByEmail("nobody@desk.io")).toEqual({
      outcome: "missing",
    });
  });

  it("purgeUnconfirmedBefore removes only unconfirmed sign-ups older than the cutoff, never a seed or a confirmed account, at most limit", async () => {
    let now = 1_000;
    const directory = createInMemoryAccountDirectory({
      now: (): number => {
        return now;
      },
      seeds: DEV_ACCOUNT_SEEDS,
    });
    await directory.signUp(createSignUp("old1@desk.io"), IP);
    await directory.signUp(createSignUp("old2@desk.io"), IP);
    await directory.signUp(createSignUp("kept@desk.io"), IP);
    await directory.confirmEmail(
      "kept@desk.io",
      DEV_CONFIRMATION_CODE,
      PASSWORD,
      IP,
    );
    now = 5_000;
    await directory.signUp(createSignUp("young@desk.io"), IP);

    expect(await directory.purgeUnconfirmedBefore(2_000, 1)).toEqual({
      outcome: "purged",
      count: 1,
    });
    // Oldest first: the one-account batch took old1, not old2.
    expect(await directory.findByEmail("old1@desk.io")).toEqual({
      outcome: "missing",
    });
    expect((await directory.findByEmail("old2@desk.io")).outcome).toBe("found");
    expect(await directory.purgeUnconfirmedBefore(2_000, 10)).toEqual({
      outcome: "purged",
      count: 1,
    });
    expect(await directory.findByEmail("old1@desk.io")).toEqual({
      outcome: "missing",
    });
    expect(await directory.findByEmail("old2@desk.io")).toEqual({
      outcome: "missing",
    });
    expect((await directory.findByEmail("kept@desk.io")).outcome).toBe("found");
    expect((await directory.findByEmail("young@desk.io")).outcome).toBe(
      "found",
    );
    // Seeds are created at 0 and exempt, whatever the cutoff.
    expect(
      await directory.purgeUnconfirmedBefore(Number.MAX_SAFE_INTEGER, 10),
    ).toEqual({ outcome: "purged", count: 1 });
    expect((await directory.findByEmail("trader@rtc.test")).outcome).toBe(
      "found",
    );
  });

  it("purgeUnconfirmedBefore never removes an unconfirmed seed, however old", async () => {
    let now = 1_000;
    const directory = createInMemoryAccountDirectory({
      now: (): number => {
        return now;
      },
      seeds: [createUnconfirmedSeed()],
    });
    await directory.signUp(createSignUp("old@desk.io"), IP);
    now = 5_000;

    expect(
      await directory.purgeUnconfirmedBefore(Number.MAX_SAFE_INTEGER, 10),
    ).toEqual({ outcome: "purged", count: 1 });
    expect(await directory.findByEmail("seed@rtc.test")).toMatchObject({
      outcome: "found",
      account: { status: "unconfirmed" },
    });
    expect(await directory.findByEmail("old@desk.io")).toEqual({
      outcome: "missing",
    });
  });
});

describe("InMemoryAccountDirectory — admin operations", () => {
  it("lists newest first, a seed stamped with the construction time", async () => {
    let now = 1_000;
    const directory = createInMemoryAccountDirectory({
      now: (): number => {
        return now;
      },
      seeds: [createUnconfirmedSeed()],
    });

    now = 2_000;
    await directory.signUp(createSignUp("old@desk.io"), IP);
    now = 3_000;
    await directory.signUp(createSignUp("new@desk.io"), IP);

    const listing = await directory.listAccounts(10);

    expect(listing.outcome).toBe("listed");

    if (listing.outcome !== "listed") {
      return;
    }

    expect(
      listing.accounts.map((account) => {
        return [account.email, account.createdAt, account.sessionsNotBefore];
      }),
    ).toEqual([
      ["new@desk.io", 3_000, null],
      ["old@desk.io", 2_000, null],
      ["seed@rtc.test", 1_000, null],
    ]);
  });

  it("caps the listing at the limit", async () => {
    const listing = await createDirectory().listAccounts(2);

    expect(listing.outcome === "listed" && listing.accounts).toHaveLength(2);
  });

  it("approves an account, and answers not_found for a stranger", async () => {
    const directory = createDirectory();

    await directory.signUp(createSignUp("ann@desk.io"), IP);
    await directory.confirmEmail(
      "ann@desk.io",
      DEV_CONFIRMATION_CODE,
      PASSWORD,
      IP,
    );

    const id = await idOf(directory, "ann@desk.io");

    expect(await directory.setApproved(id)).toBe("ok");
    expect(await directory.findAccount(id)).toMatchObject({
      account: { status: "active" },
    });
    expect(await directory.setApproved("nobody")).toBe("not_found");
  });

  it("blocking blocks and stamps; unblocking clears the flag and keeps the stamp", async () => {
    const directory = createDirectory();
    const id = TRADER_ID;

    expect(await directory.setBlocked(id, true, 5_000)).toBe("ok");
    expect(await directory.findAccount(id)).toMatchObject({
      account: { status: "blocked", sessionsNotBefore: 5_000 },
    });
    expect(await directory.setBlocked(id, false, 9_000)).toBe("ok");
    expect(await directory.findAccount(id)).toMatchObject({
      account: { status: "active", sessionsNotBefore: 5_000 },
    });
    expect(await directory.setBlocked("nobody", true, 1)).toBe("not_found");
  });

  it("renames and stamps", async () => {
    const directory = createDirectory();

    expect(await directory.rename(TRADER_ID, "Trader Two", 6_000)).toBe("ok");
    expect(await directory.findAccount(TRADER_ID)).toMatchObject({
      account: { displayName: "Trader Two", sessionsNotBefore: 6_000 },
    });
    expect(await directory.rename("nobody", "X", 1)).toBe("not_found");
  });

  it("revokeSessions stamps and nothing else", async () => {
    const directory = createDirectory();

    expect(await directory.revokeSessions(TRADER_ID, 7_000)).toBe("ok");
    expect(await directory.findAccount(TRADER_ID)).toMatchObject({
      account: {
        displayName: "Guest Trader",
        status: "active",
        sessionsNotBefore: 7_000,
      },
    });
    expect(await directory.revokeSessions("nobody", 1)).toBe("not_found");
  });

  it("a deleted account is missing everywhere", async () => {
    const directory = createDirectory();

    expect(await directory.deleteAccount(TRADER_ID)).toBe("ok");
    expect(await directory.findAccount(TRADER_ID)).toEqual({
      outcome: "missing",
    });
    expect(await directory.findByEmail("trader@rtc.test")).toEqual({
      outcome: "missing",
    });
    expect(await directory.deleteAccount(TRADER_ID)).toBe("not_found");
  });

  it("seeds are not registrations", async () => {
    expect(await createDirectory().countRegistrationsSince(0)).toEqual({
      outcome: "counted",
      count: 0,
    });
  });
});

async function idOf(
  directory: AccountDirectory,
  email: string,
): Promise<string> {
  const lookup = await directory.findByEmail(email);

  if (lookup.outcome !== "found") {
    throw new Error("account expected");
  }

  return lookup.account.id;
}

function createUnconfirmedSeed(): DevAccountSeed {
  return {
    id: "00000000-0000-4000-8000-0000000000ff",
    email: "seed@rtc.test",
    displayName: "Unconfirmed Seed",
    access: "user",
    status: "unconfirmed",
  };
}

function createDirectory(hash?: PasswordHash): AccountDirectory {
  return createInMemoryAccountDirectory({
    now: (): number => {
      return 1_000;
    },
    seeds: DEV_ACCOUNT_SEEDS,
    hash,
  });
}

interface SwitchableHash {
  failing: boolean;
  readonly hash: PasswordHash;
}

/** The real hash, or a rejection while `failing` is set. */
function createSwitchableHash(): SwitchableHash {
  const switchable: SwitchableHash = {
    failing: false,
    hash: (password: string, salt: Buffer): Promise<Buffer> => {
      return switchable.failing
        ? Promise.reject(new Error("scrypt failed"))
        : hashPassword(password, salt);
    },
  };

  return switchable;
}

function createSignUp(email: string): SignUpInput {
  return { email, displayName: "Ann Lee" };
}

/** Signs up and confirms with the dev code, setting `PASSWORD`. */
async function createConfirmedAccount(
  directory: AccountDirectory,
  email: string,
): Promise<void> {
  await directory.signUp(createSignUp(email), IP);
  await directory.confirmEmail(email, DEV_CONFIRMATION_CODE, PASSWORD, IP);
}

const IP = "1.2.3.4";

const TRADER_ID = "00000000-0000-4000-8000-000000000002";

const PASSWORD = "Mcdc2026!desk";
