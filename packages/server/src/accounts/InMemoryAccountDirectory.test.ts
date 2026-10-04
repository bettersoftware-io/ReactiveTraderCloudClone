import { describe, expect, it } from "vitest";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import {
  DEV_ACCOUNT_PASSWORD,
  DEV_ACCOUNT_SEEDS,
} from "#/accounts/devAccounts";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
} from "#/accounts/InMemoryAccountDirectory";

describe("InMemoryAccountDirectory", () => {
  it("a new sign-up is unconfirmed until the code is entered", async () => {
    const directory = createDirectory();

    expect(await directory.signUp(createSignUp("ann@desk.io"), IP)).toBe(
      "sent",
    );
    expect(await directory.checkPassword("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "unconfirmed",
    });
    expect(await directory.confirmEmail("ann@desk.io", "111111", IP)).toBe(
      "invalid_code",
    );
    expect(
      await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP),
    ).toBe("confirmed");

    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    expect(check.outcome).toBe("match");
  });

  it("a confirmed sign-up is pending, never active, with the user role", async () => {
    const directory = createDirectory();
    await directory.signUp(createSignUp("ann@desk.io"), IP);
    await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP);
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
      },
    });
  });

  it("signing up an existing address answers `sent` and changes nothing", async () => {
    const directory = createDirectory();
    await directory.signUp(createSignUp("ann@desk.io"), IP);
    await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP);

    expect(
      await directory.signUp(
        {
          email: "ann@desk.io",
          displayName: "Mallory",
          password: "Other2026!x",
        },
        IP,
      ),
    ).toBe("sent");
    expect(
      (await directory.checkPassword("ann@desk.io", PASSWORD, IP)).outcome,
    ).toBe("match");
    expect(
      (await directory.checkPassword("ann@desk.io", "Other2026!x", IP)).outcome,
    ).toBe("invalid");
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
      await directory.resetPassword("trader@rtc.test", "111111", next, IP),
    ).toBe("invalid_code");
    expect(
      await directory.resetPassword(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        next,
        IP,
      ),
    ).toBe("changed");
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
        },
      },
    );
  });

  it("two overlapping sign-ups for one address keep the first, whole", async () => {
    const directory = createDirectory();
    const [first, second] = await Promise.all([
      directory.signUp(createSignUp("ann@desk.io"), IP),
      directory.signUp(
        {
          email: "ann@desk.io",
          displayName: "Mallory",
          password: "Other2026!x",
        },
        IP,
      ),
    ]);

    expect([first, second]).toEqual(["sent", "sent"]);

    await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP);
    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    expect(check.outcome).toBe("match");
    expect(
      (await directory.checkPassword("ann@desk.io", "Other2026!x", IP)).outcome,
    ).toBe("invalid");

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
    await directory.signUp(createSignUp("ann@desk.io"), IP);
    await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP);
    await directory.signUp(
      { email: "ann@desk.io", displayName: "Mallory", password: "Other2026!x" },
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
      await directory.confirmEmail("nobody@desk.io", DEV_CONFIRMATION_CODE, IP),
    ).toBe("invalid_code");
    expect(
      await directory.confirmEmail(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        IP,
      ),
    ).toBe("invalid_code");
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
});

function createDirectory(): AccountDirectory {
  return createInMemoryAccountDirectory({
    now: (): number => {
      return 1_000;
    },
    seeds: DEV_ACCOUNT_SEEDS,
  });
}

interface SignUp {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

function createSignUp(email: string): SignUp {
  return { email, displayName: "Ann Lee", password: PASSWORD };
}

const IP = "1.2.3.4";

const PASSWORD = "Mcdc2026!desk";
