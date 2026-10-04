import { describe, expect, it, vi } from "vitest";

import type {
  AccountDirectory,
  RegistrationCount,
  SignUpOutcome,
} from "#/accounts/AccountDirectory";
import {
  type AccountService,
  createAccountService,
} from "#/accounts/AccountService";
import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";
import {
  DEV_ACCOUNT_PASSWORD,
  DEV_ACCOUNT_SEEDS,
} from "#/accounts/devAccounts";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
} from "#/accounts/InMemoryAccountDirectory";

describe("AccountService.register", () => {
  it("sends a code for a valid request", async () => {
    const { service } = createService();

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
  });

  it.each([
    [{ email: "not-an-email" }, "email"],
    [{ displayName: "A" }, "display-name"],
    [{ password: "short" }, "min-length"],
    [{ password: "nouppercase2026!" }, "uppercase"],
  ])("names the broken rule for %o", async (override, rule) => {
    const { service } = createService();

    expect(
      await service.register({ ...createRegistration(), ...override }, IP),
    ).toEqual({ outcome: "invalid", rule });
  });

  it("normalizes the address and the display name before the directory sees them (Review Focus 3)", async () => {
    const { service, directory } = createService();
    const signUp = vi.spyOn(directory, "signUp");

    await service.register(
      {
        email: "  Ann@Desk.IO ",
        displayName: "  Ann   Lee ",
        password: PASSWORD,
      },
      IP,
    );

    expect(signUp).toHaveBeenCalledWith(
      { email: "ann@desk.io", displayName: "Ann Lee", password: PASSWORD },
      IP,
    );
  });

  it("answers the same for an address that already has an account", async () => {
    const { service } = createService();

    expect(
      await service.register(
        { ...createRegistration(), email: "trader@rtc.test" },
        IP,
      ),
    ).toEqual({ outcome: "code_sent" });
  });

  it("is closed when registration is switched off, before any validation", async () => {
    const { service, directory } = createService({ registrationOpen: false });
    const signUp = vi.spyOn(directory, "signUp");

    expect(
      await service.register({ ...createRegistration(), email: "bad" }, IP),
    ).toEqual({ outcome: "closed" });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("is closed once the day's registrations reach the cap", async () => {
    const { service } = createService({ maxRegistrationsPerDay: 1 });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    expect(
      await service.register(
        { ...createRegistration(), email: "bob@desk.io" },
        IP,
      ),
    ).toEqual({ outcome: "closed" });
  });

  it("is unavailable when the directory cannot count", async () => {
    const service = createAccountService({
      directory: createDisabledAccountDirectory(),
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "unavailable",
    });
  });

  it("maps the directory's own rejections to a named rule", async () => {
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp: () => {
        return Promise.resolve("rejected-email");
      },
    };

    const service = createAccountService({
      directory,
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "invalid",
      rule: "email",
    });
  });
});

describe("AccountService.login", () => {
  it.each([
    ["trader@rtc.test", "ok"],
    ["admin@rtc.test", "ok"],
    ["pending@rtc.test", "pending"],
    ["blocked@rtc.test", "blocked"],
  ])("%s signs in as %s", async (email, outcome) => {
    const { service } = createService();

    expect((await service.login(email, DEV_ACCOUNT_PASSWORD, IP)).outcome).toBe(
      outcome,
    );
  });

  it("reveals pending and blocked only after a correct password", async () => {
    const { service } = createService();

    expect(
      await service.login("blocked@rtc.test", "Wrong2026!pass", IP),
    ).toEqual({ outcome: "invalid" });
  });

  it("is unconfirmed before the code is entered", async () => {
    const { service } = createService();
    await service.register(createRegistration(), IP);

    expect(await service.login("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "unconfirmed",
    });
  });

  it("matches a differently spelled address to the same account (Review Focus 3)", async () => {
    const { service } = createService();

    expect(
      (await service.login("  TRADER@rtc.test ", DEV_ACCOUNT_PASSWORD, IP))
        .outcome,
    ).toBe("ok");
  });

  it("carries the account on success", async () => {
    const { service } = createService();
    const decision = await service.login(
      "admin@rtc.test",
      DEV_ACCOUNT_PASSWORD,
      IP,
    );

    expect(decision).toEqual({
      outcome: "ok",
      account: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "admin@rtc.test",
        displayName: "Desk Admin",
        access: "admin",
        status: "active",
      },
    });
  });

  it("is unavailable when the password checks but the profile cannot be read", async () => {
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      checkPassword: () => {
        return Promise.resolve({ outcome: "match", accountId: "acc-1" });
      },
    };

    const service = createAccountService({
      directory,
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.login("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "unavailable",
    });
  });

  it("is invalid when the password checks but the profile is gone", async () => {
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      checkPassword: () => {
        return Promise.resolve({ outcome: "match", accountId: "acc-1" });
      },
      findAccount: () => {
        return Promise.resolve({ outcome: "missing" });
      },
    };

    const service = createAccountService({
      directory,
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.login("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "invalid",
    });
  });
});

describe("AccountService codes and resets", () => {
  it("confirms with the right code and reports a wrong one", async () => {
    const { service } = createService();
    await service.register(createRegistration(), IP);

    expect(await service.confirmEmail("ann@desk.io", "111111", IP)).toBe(
      "invalid_code",
    );
    expect(
      await service.confirmEmail(" Ann@Desk.io", DEV_CONFIRMATION_CODE, IP),
    ).toBe("confirmed");
  });

  it("refuses a malformed code without asking the directory", async () => {
    const { service, directory } = createService();
    const confirm = vi.spyOn(directory, "confirmEmail");

    expect(await service.confirmEmail("ann@desk.io", "12ab", IP)).toBe(
      "invalid_code",
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("resend and request-reset reject only a malformed address", async () => {
    const { service } = createService();

    expect(await service.resendCode("nobody@desk.io", IP)).toBe("code_sent");
    expect(await service.requestReset("nobody@desk.io", IP)).toBe("code_sent");
    expect(await service.resendCode("nope", IP)).toBe("invalid");
    expect(await service.requestReset("nope", IP)).toBe("invalid");
  });

  it("a reset enforces the password rule before the directory is asked", async () => {
    const { service, directory } = createService();
    const reset = vi.spyOn(directory, "resetPassword");

    expect(
      await service.resetPassword(
        {
          email: "trader@rtc.test",
          code: DEV_CONFIRMATION_CODE,
          password: "weak",
        },
        IP,
      ),
    ).toEqual({ outcome: "invalid", rule: "min-length" });
    expect(reset).not.toHaveBeenCalled();
  });

  it("a requested reset changes the password", async () => {
    const { service } = createService();
    await service.requestReset("trader@rtc.test", IP);

    expect(
      await service.resetPassword(
        {
          email: "trader@rtc.test",
          code: DEV_CONFIRMATION_CODE,
          password: "Fresh2026!pass",
        },
        IP,
      ),
    ).toEqual({ outcome: "changed" });
    expect(
      (await service.login("trader@rtc.test", "Fresh2026!pass", IP)).outcome,
    ).toBe("ok");
  });
});

describe("AccountService.register under concurrency", () => {
  it("lets only one of a burst through when one slot is left", async () => {
    const signUps: Deferred<SignUpOutcome>[] = [];
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 9 });
      },
      signUp: () => {
        const deferred = createDeferred<SignUpOutcome>();
        signUps.push(deferred);

        return deferred.promise;
      },
    });
    const service = createDoubleService(directory, 10);

    const results = [1, 2, 3, 4, 5].map((n) => {
      return service.register(
        { ...createRegistration(), email: `n${n}@desk.io` },
        IP,
      );
    });
    await flushMicrotasks();

    expect(signUps).toHaveLength(1);
    signUps[0]?.resolve("sent");

    const outcomes = (await Promise.all(results)).map((r) => {
      return r.outcome;
    });

    expect(
      outcomes.filter((o) => {
        return o === "code_sent";
      }),
    ).toHaveLength(1);
    expect(
      outcomes.filter((o) => {
        return o === "closed";
      }),
    ).toHaveLength(4);
  });

  it("counts a sign-up answered while a stale count was being read", async () => {
    const counts: Deferred<RegistrationCount>[] = [];
    const signUps: Deferred<SignUpOutcome>[] = [];
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        const deferred = createDeferred<RegistrationCount>();
        counts.push(deferred);

        return deferred.promise;
      },
      signUp: () => {
        const deferred = createDeferred<SignUpOutcome>();
        signUps.push(deferred);

        return deferred.promise;
      },
    });
    const service = createDoubleService(directory, 1);

    const a = service.register(createRegistration(), IP);
    await flushMicrotasks();
    counts[0]?.resolve({ outcome: "counted", count: 0 });
    await flushMicrotasks();

    const b = service.register(
      { ...createRegistration(), email: "bob@desk.io" },
      IP,
    );
    await flushMicrotasks();
    signUps[0]?.resolve("sent");

    expect(await a).toEqual({ outcome: "code_sent" });
    counts[1]?.resolve({ outcome: "counted", count: 0 });

    expect(await b).toEqual({ outcome: "closed" });
    expect(signUps).toHaveLength(1);
  });

  it("opens again once the answered sign-ups are inside the directory's count", async () => {
    const signUp = vi.fn((): Promise<SignUpOutcome> => {
      return Promise.resolve("sent");
    });

    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp,
    });
    const service = createDoubleService(directory, 2);

    await service.register(createRegistration(), IP);

    expect(
      await service.register(
        { ...createRegistration(), email: "bob@desk.io" },
        IP,
      ),
    ).toEqual({ outcome: "code_sent" });
    expect(signUp).toHaveBeenCalledTimes(2);
  });

  it("does not leak an in-flight slot when signUp rejects", async () => {
    let calls = 0;
    const signUp = vi.fn((): Promise<SignUpOutcome> => {
      calls += 1;

      return calls === 1
        ? Promise.reject(new Error("boom"))
        : Promise.resolve("sent");
    });

    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp,
    });
    const service = createDoubleService(directory, 1);

    await expect(service.register(createRegistration(), IP)).rejects.toThrow(
      "boom",
    );

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    expect(signUp).toHaveBeenCalledTimes(2);
  });
});

describe("AccountService normalization on every method", () => {
  it("resendCode and requestReset hand the directory a normalized address", async () => {
    const { service, directory } = createService();
    const resend = vi.spyOn(directory, "resendCode");
    const reset = vi.spyOn(directory, "requestReset");

    await service.resendCode(" TRADER@rtc.test ", IP);
    await service.requestReset(" TRADER@rtc.test ", IP);

    expect(resend).toHaveBeenCalledWith("trader@rtc.test", IP);
    expect(reset).toHaveBeenCalledWith("trader@rtc.test", IP);
  });

  it("resetPassword matches a differently spelled address", async () => {
    const { service } = createService();
    await service.requestReset(" TRADER@rtc.test ", IP);

    expect(
      await service.resetPassword(
        {
          email: " TRADER@rtc.test ",
          code: DEV_CONFIRMATION_CODE,
          password: "Fresh2026!pass",
        },
        IP,
      ),
    ).toEqual({ outcome: "changed" });
  });
});

describe("AccountService when one directory operation is unavailable", () => {
  it("register is unavailable when only signUp is", async () => {
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp: () => {
        return Promise.resolve("unavailable");
      },
    });

    expect(
      await createDoubleService(directory, 10).register(
        createRegistration(),
        IP,
      ),
    ).toEqual({ outcome: "unavailable" });
  });

  it("resendCode and requestReset are unavailable", async () => {
    const directory = createDoubleDirectory({
      resendCode: () => {
        return Promise.resolve("unavailable");
      },
      requestReset: () => {
        return Promise.resolve("unavailable");
      },
    });
    const service = createDoubleService(directory, 10);

    expect(await service.resendCode("ann@desk.io", IP)).toBe("unavailable");
    expect(await service.requestReset("ann@desk.io", IP)).toBe("unavailable");
  });

  it("login is unavailable when the password check is", async () => {
    const directory = createDoubleDirectory({
      checkPassword: () => {
        return Promise.resolve({ outcome: "unavailable" });
      },
    });

    expect(
      await createDoubleService(directory, 10).login(
        "ann@desk.io",
        PASSWORD,
        IP,
      ),
    ).toEqual({ outcome: "unavailable" });
  });
});

describe("AccountService daily window", () => {
  it("asks the directory to count exactly the last 24 hours", async () => {
    const sinceMs: number[] = [];
    const directory = createDoubleDirectory({
      countRegistrationsSince: (since: number): Promise<RegistrationCount> => {
        sinceMs.push(since);

        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp: () => {
        return Promise.resolve("sent");
      },
    });

    await createDoubleService(directory, 10).register(createRegistration(), IP);

    expect(sinceMs).toEqual([createClock()() - 86_400_000]);
  });
});

interface ServiceOverrides {
  readonly registrationOpen?: boolean;
  readonly maxRegistrationsPerDay?: number;
}

interface ServiceFixture {
  readonly service: AccountService;
  readonly directory: AccountDirectory;
}

function createService(overrides: ServiceOverrides = {}): ServiceFixture {
  const now = createClock();
  const directory = createInMemoryAccountDirectory({
    now,
    seeds: DEV_ACCOUNT_SEEDS,
  });

  const service = createAccountService({
    directory,
    now,
    registrationOpen: overrides.registrationOpen ?? true,
    maxRegistrationsPerDay: overrides.maxRegistrationsPerDay ?? 10,
  });

  return { service, directory };
}

/** A day past zero, so the seeds (created at 0) fall outside the daily window. */
function createClock(): () => number {
  return (): number => {
    return 2 * 24 * 60 * 60 * 1_000;
  };
}

interface Registration {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

function createRegistration(): Registration {
  return { email: "ann@desk.io", displayName: "Ann Lee", password: PASSWORD };
}

const IP = "1.2.3.4";

const PASSWORD = "Mcdc2026!desk";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return {
    promise,
    resolve(value: T): void {
      resolve?.(value);
    },
  };
}

/** Lets every already-resolved promise hop run. */
async function flushMicrotasks(): Promise<void> {
  for (let hop = 0; hop < 10; hop += 1) {
    await Promise.resolve();
  }
}

function createDoubleDirectory(
  overrides: Partial<AccountDirectory>,
): AccountDirectory {
  return { ...createDisabledAccountDirectory(), ...overrides };
}

function createDoubleService(
  directory: AccountDirectory,
  maxRegistrationsPerDay: number,
): AccountService {
  return createAccountService({
    directory,
    now: createClock(),
    registrationOpen: true,
    maxRegistrationsPerDay,
  });
}
