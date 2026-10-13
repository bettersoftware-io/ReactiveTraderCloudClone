import { describe, expect, it, vi } from "vitest";

import type { ConfirmEmailRequestDto, RegisterRequestDto } from "@rtc/shared";

import type {
  AccountDirectory,
  AccountRecord,
  ConfirmOutcome,
  RegistrationCount,
  SendOutcome,
  SignUpOutcome,
} from "#/accounts/AccountDirectory";
import {
  type AccountService,
  type AccountServiceOptions,
  createAccountService,
  type SendFuses,
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
import { createRateLimiter, type RateLimiter } from "#/auth/rateLimit";

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
      { email: "  Ann@Desk.IO ", displayName: "  Ann   Lee " },
      IP,
    );

    // Exactly these two fields: nothing chosen before the mailbox is proven
    // reaches the directory as a credential.
    expect(signUp).toHaveBeenCalledWith(
      { email: "ann@desk.io", displayName: "Ann Lee" },
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
      codeEntryLimiter: createRateLimiter(100, 60_000),
      sendLimiter: createRateLimiter(100, 60_000),
      sendFuses: createFuses(),
      log: ignoreLog,
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "unavailable",
    });
  });

  it("answers code_sent even when the directory later rejects the address (the send is detached)", async () => {
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
      codeEntryLimiter: createRateLimiter(100, 60_000),
      sendLimiter: createRateLimiter(100, 60_000),
      sendFuses: createFuses(),
      log: ignoreLog,
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
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

  it("no password signs in before the code is entered — none was chosen yet", async () => {
    const { service } = createService();
    await service.register(createRegistration(), IP);

    expect(await service.login("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "invalid",
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
      codeEntryLimiter: createRateLimiter(100, 60_000),
      sendLimiter: createRateLimiter(100, 60_000),
      sendFuses: createFuses(),
      log: ignoreLog,
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
      codeEntryLimiter: createRateLimiter(100, 60_000),
      sendLimiter: createRateLimiter(100, 60_000),
      sendFuses: createFuses(),
      log: ignoreLog,
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

    expect(
      await service.confirmEmail(createConfirmation({ code: "11111111" }), IP),
    ).toEqual({ outcome: "invalid_code" });
    expect(
      await service.confirmEmail(
        createConfirmation({ email: " Ann@Desk.io" }),
        IP,
      ),
    ).toEqual({ outcome: "confirmed" });
  });

  it("refuses a malformed code without asking the directory, before the password rule", async () => {
    const { service, directory } = createService();
    const confirm = vi.spyOn(directory, "confirmEmail");

    expect(
      await service.confirmEmail(
        createConfirmation({ code: "12ab", password: "weak" }),
        IP,
      ),
    ).toEqual({ outcome: "invalid_code" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("hands the directory the normalized address, the code and the password", async () => {
    const { service, directory } = createService();
    const confirm = vi.spyOn(directory, "confirmEmail");

    await service.confirmEmail(
      createConfirmation({ email: " ANN@desk.io " }),
      IP,
    );

    expect(confirm).toHaveBeenCalledWith(
      "ann@desk.io",
      DEV_CONFIRMATION_CODE,
      PASSWORD,
      IP,
    );
  });

  it("a weak password at confirm names its rule and does not spend the code", async () => {
    const { service, directory } = createService();
    await service.register(createRegistration(), IP);
    const confirm = vi.spyOn(directory, "confirmEmail");

    expect(
      await service.confirmEmail(createConfirmation({ password: "short" }), IP),
    ).toEqual({ outcome: "invalid", rule: "min-length" });
    expect(
      await service.confirmEmail(
        createConfirmation({ password: "nouppercase2026!" }),
        IP,
      ),
    ).toEqual({ outcome: "invalid", rule: "uppercase" });
    expect(confirm).not.toHaveBeenCalled();

    // Still unconfirmed: the same code then confirms with a good password.
    expect(await service.confirmEmail(createConfirmation(), IP)).toEqual({
      outcome: "confirmed",
    });
    expect((await service.login("ann@desk.io", PASSWORD, IP)).outcome).toBe(
      "pending",
    );
  });

  it("passes `confirmed_unset` through: confirmed, but no password stored", async () => {
    const directory = createDoubleDirectory({
      confirmEmail: (): Promise<ConfirmOutcome> => {
        return Promise.resolve("confirmed_unset");
      },
    });

    expect(
      await createDoubleService(directory, 10).confirmEmail(
        createConfirmation(),
        IP,
      ),
    ).toEqual({ outcome: "confirmed_unset" });
  });

  it("resend and request-reset reject only a malformed address", async () => {
    const { service } = createService();

    expect(await service.resendCode("nobody@desk.io", IP)).toBe("code_sent");
    expect(await service.requestReset("nobody@desk.io", IP)).toBe("code_sent");
    expect(await service.resendCode("nope", IP)).toBe("invalid");
    expect(await service.requestReset("nope", IP)).toBe("invalid");
  });

  it("a reset refuses a malformed code before the password rule, without asking the directory", async () => {
    const { service, directory } = createService();
    const reset = vi.spyOn(directory, "resetPassword");

    expect(
      await service.resetPassword(
        { email: "trader@rtc.test", code: "12ab", password: "weak" },
        IP,
      ),
    ).toEqual({ outcome: "invalid_code" });
    expect(
      await service.resetPassword(
        {
          email: "not-an-email",
          code: DEV_CONFIRMATION_CODE,
          password: "weak",
        },
        IP,
      ),
    ).toEqual({ outcome: "invalid_code" });
    expect(reset).not.toHaveBeenCalled();
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

describe("AccountService closes account pre-hijacking", () => {
  it("an unconfirmed squatter's registration gives them no credential on the owner's account", async () => {
    const { service, directory } = createService();
    const signUp = vi.spyOn(directory, "signUp");
    const attacker = "Attack2026!pass";
    const owner = "Owner2026!pass";

    // The attacker registers the victim's address and never confirms. The
    // request carries no password; an extra field is not read.
    expect(
      await service.register(
        {
          email: "victim@rtc.test",
          displayName: "Mallory",
          password: attacker,
        } as RegisterRequestDto,
        IP,
      ),
    ).toEqual({ outcome: "code_sent" });
    expect(signUp).toHaveBeenCalledWith(
      { email: "victim@rtc.test", displayName: "Mallory" },
      IP,
    );

    // The owner registers the same address, receives the code and confirms
    // it together with their own password.
    expect(
      await service.register(
        { email: "victim@rtc.test", displayName: "Victoria" },
        IP,
      ),
    ).toEqual({ outcome: "code_sent" });
    expect(
      await service.confirmEmail(
        {
          email: "victim@rtc.test",
          code: DEV_CONFIRMATION_CODE,
          password: owner,
        },
        IP,
      ),
    ).toEqual({ outcome: "confirmed" });

    // The owner's password is the account's: accepted, awaiting approval.
    expect(await service.login("victim@rtc.test", owner, IP)).toEqual({
      outcome: "pending",
    });
    // No other password signs in — the attacker's least of all.
    expect(await service.login("victim@rtc.test", attacker, IP)).toEqual({
      outcome: "invalid",
    });
    expect(
      await service.login("victim@rtc.test", "Other2026!pass", IP),
    ).toEqual({ outcome: "invalid" });
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
    // Max 1: one earlier answered sign-up must not count again once the
    // directory's count includes it — at max 2 a stale total or a leaked
    // in-flight slot would still leave room and survive.
    const service = createDoubleService(directory, 1);

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

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    await flushMicrotasks();

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    expect(signUp).toHaveBeenCalledTimes(2);
  });
});

describe("AccountService normalization on every method", () => {
  it("resendCode and requestReset hand the directory a normalized address", async () => {
    const { service, directory } = createService();
    await directory.signUp({ email: "ann@desk.io", displayName: "Ann" }, IP);
    const resend = vi.spyOn(directory, "resendCode");
    const reset = vi.spyOn(directory, "requestReset");

    await service.resendCode(" ANN@desk.io ", IP);
    await service.requestReset(" TRADER@rtc.test ", IP);

    expect(resend).toHaveBeenCalledWith("ann@desk.io", IP);
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
  it("register answers code_sent when only signUp is unavailable, and logs the route and the word", async () => {
    const lines: string[] = [];
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp: () => {
        return Promise.resolve("unavailable");
      },
    });

    const service = createAccountService({
      ...createOptions(directory),
      log: (line: string): void => {
        lines.push(line);
      },
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    await flushMicrotasks();

    expect(lines).toEqual([
      "[accounts] detached send route=/register outcome=unavailable",
    ]);
  });

  it("resendCode and requestReset answer code_sent when only the send is unavailable, and log each route and word", async () => {
    const lines: string[] = [];
    const directory = createDoubleDirectory({
      findByEmail: (email: string) => {
        return Promise.resolve({
          outcome: "found",
          account: {
            ...createUnconfirmedRecord(),
            email,
            status: email === "ann@desk.io" ? "unconfirmed" : "active",
          },
        });
      },
      resendCode: () => {
        return Promise.resolve("unavailable");
      },
      requestReset: () => {
        return Promise.resolve("unavailable");
      },
    });

    const service = createAccountService({
      ...createOptions(directory),
      log: (line: string): void => {
        lines.push(line);
      },
    });

    expect(await service.resendCode("ann@desk.io", IP)).toBe("code_sent");
    expect(await service.requestReset("bob@desk.io", IP)).toBe("code_sent");
    await flushMicrotasks();

    expect(lines).toEqual([
      "[accounts] detached send route=/resend-code outcome=unavailable",
      "[accounts] detached send route=/request-reset outcome=unavailable",
    ]);
  });

  it("a send that throws is logged as threw and never rejects the request", async () => {
    const lines: string[] = [];
    const directory = createDoubleDirectory({
      findByEmail: () => {
        return Promise.resolve({
          outcome: "found",
          account: createUnconfirmedRecord(),
        });
      },
      resendCode: () => {
        return Promise.reject(new Error("boom ann@desk.io"));
      },
    });

    const service = createAccountService({
      ...createOptions(directory),
      log: (line: string): void => {
        lines.push(line);
      },
    });

    expect(await service.resendCode("ann@desk.io", IP)).toBe("code_sent");
    await flushMicrotasks();

    expect(lines).toEqual([
      "[accounts] detached send route=/resend-code outcome=threw",
    ]);
  });

  it("a log that throws inside a detached send surfaces nothing", async () => {
    const unhandled: unknown[] = [];

    function recordUnhandled(reason: unknown): void {
      unhandled.push(reason);
    }

    process.on("unhandledRejection", recordUnhandled);

    try {
      const directory = createDoubleDirectory({
        countRegistrationsSince: () => {
          return Promise.resolve({ outcome: "counted", count: 0 });
        },
        signUp: () => {
          return Promise.resolve("unavailable");
        },
      });

      const log = vi.fn((): void => {
        throw new Error("log sink down");
      });

      const service = createAccountService({
        ...createOptions(directory),
        log,
      });

      expect(await service.register(createRegistration(), IP)).toEqual({
        outcome: "code_sent",
      });
      await flushMicrotasks();
      await new Promise<void>((done) => {
        setImmediate(done);
      });

      expect(log).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", recordUnhandled);
    }
  });

  it("a signUp that throws synchronously is logged as threw and releases its in-flight slot", async () => {
    const lines: string[] = [];
    let calls = 0;
    const signUp = vi.fn((): Promise<SignUpOutcome> => {
      calls += 1;

      if (calls === 1) {
        throw new Error("boom ann@desk.io");
      }

      return Promise.resolve("sent");
    });

    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp,
    });

    const service = createAccountService({
      ...createOptions(directory),
      maxRegistrationsPerDay: 1,
      log: (line: string): void => {
        lines.push(line);
      },
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    await flushMicrotasks();

    expect(lines).toEqual([
      "[accounts] detached send route=/register outcome=threw",
    ]);
    expect(
      await service.register(
        { ...createRegistration(), email: "bob@desk.io" },
        IP,
      ),
    ).toEqual({ outcome: "code_sent" });
    expect(signUp).toHaveBeenCalledTimes(2);
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

describe("AccountService per-address code limit", () => {
  it("counts only requests that reach the directory: local validation failures spend nothing", async () => {
    const { service, directory } = createService({
      codeEntryLimiter: createRateLimiter(2, WINDOW_MS),
    });
    await service.register(createRegistration(), IP);
    await service.requestReset("ann@desk.io", IP);
    const confirm = vi.spyOn(directory, "confirmEmail");
    const reset = vi.spyOn(directory, "resetPassword");

    for (let i = 0; i < 3; i += 1) {
      await service.confirmEmail(createConfirmation({ code: "12ab" }), IP);
      await service.confirmEmail(createConfirmation({ password: "weak" }), IP);
      await service.resetPassword(
        { email: "ann@desk.io", code: "12ab", password: PASSWORD },
        IP,
      );
      await service.resetPassword(
        { email: "ann@desk.io", code: DEV_CONFIRMATION_CODE, password: "weak" },
        IP,
      );
    }

    expect(confirm).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(await service.confirmEmail(createConfirmation(), IP)).toEqual({
      outcome: "confirmed",
    });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("two well-formed wrong-code attempts spend the budget; the third is throttled without a directory call", async () => {
    const { service, directory } = createService({
      codeEntryLimiter: createRateLimiter(2, WINDOW_MS),
    });
    await service.register(createRegistration(), IP);
    const confirm = vi.spyOn(directory, "confirmEmail");
    const wrong = createConfirmation({ code: "11111111" });

    await service.confirmEmail(wrong, IP);
    await service.confirmEmail(wrong, IP);

    expect(await service.confirmEmail(createConfirmation(), IP)).toEqual({
      outcome: "throttled",
    });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("confirm and reset share one budget", async () => {
    const { service, directory } = createService({
      codeEntryLimiter: createRateLimiter(2, WINDOW_MS),
    });
    const reset = vi.spyOn(directory, "resetPassword");

    await service.confirmEmail(createConfirmation({ code: "11111111" }), IP);
    await service.resetPassword(
      { email: "ann@desk.io", code: "11111111", password: PASSWORD },
      IP,
    );

    expect(
      await service.resetPassword(
        { email: "ann@desk.io", code: "11111111", password: PASSWORD },
        IP,
      ),
    ).toEqual({ outcome: "throttled" });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("spellings of one address share one budget", async () => {
    const { service } = createService({
      codeEntryLimiter: createRateLimiter(1, WINDOW_MS),
    });

    await service.confirmEmail(
      createConfirmation({ email: "trader@rtc.test", code: "11111111" }),
      IP,
    );

    expect(
      await service.confirmEmail(
        createConfirmation({ email: " Trader@RTC.test ", code: "11111111" }),
        IP,
      ),
    ).toEqual({ outcome: "throttled" });
  });

  it("the address may try again once the window has passed", async () => {
    let at = 2 * 24 * 60 * 60 * 1_000;
    const { service } = createService({
      now: (): number => {
        return at;
      },
      codeEntryLimiter: createRateLimiter(1, WINDOW_MS),
    });
    const wrong = createConfirmation({ code: "11111111" });

    await service.confirmEmail(wrong, IP);
    expect(await service.confirmEmail(wrong, IP)).toEqual({
      outcome: "throttled",
    });

    at += WINDOW_MS;

    expect(await service.confirmEmail(wrong, IP)).toEqual({
      outcome: "invalid_code",
    });
  });

  const WINDOW_MS = 60_000;
});

describe("AccountService per-address send limit", () => {
  it.each(["register", "resendCode", "requestReset"] as const)(
    "the fourth send for one address within the hour is throttled when %s makes it, and the directory is not called",
    async (path: SendPath) => {
      const { service, directory } = createService({
        sendLimiter: createRateLimiter(3, HOUR_MS),
      });

      await service.register(createRegistration(), IP);
      await service.resendCode("ann@desk.io", IP);
      await service.requestReset("ann@desk.io", IP);

      const calls = spyOnSends(directory);

      expect(await sendVia(service, path, "ann@desk.io")).toBe("throttled");
      expect(calls()).toBe(0);
    },
  );

  it("a throttled registration is refused before the daily cap is counted", async () => {
    const { service, directory } = createService({
      sendLimiter: createRateLimiter(1, HOUR_MS),
    });

    await service.resendCode("ann@desk.io", IP);
    const count = vi.spyOn(directory, "countRegistrationsSince");

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "throttled",
    });
    expect(count).not.toHaveBeenCalled();
  });

  it("differently spelled addresses share one budget", async () => {
    const { service } = createService({
      sendLimiter: createRateLimiter(1, HOUR_MS),
    });

    expect(await service.resendCode("ann@desk.io", IP)).toBe("code_sent");
    expect(await service.requestReset("  ANN@Desk.io ", IP)).toBe("throttled");
  });

  it("an invalid request, or a closed registration, spends nothing", async () => {
    const hit = vi.fn((): boolean => {
      return true;
    });

    const { service } = createService({
      sendLimiter: {
        hit,
        peek: (): boolean => {
          return true;
        },
        size: (): number => {
          return 0;
        },
      },
    });

    const closed = createService({
      registrationOpen: false,
      sendLimiter: {
        hit,
        peek: (): boolean => {
          return true;
        },
        size: (): number => {
          return 0;
        },
      },
    }).service;

    await service.resendCode("nope", IP);
    await service.requestReset("nope", IP);
    await service.register({ ...createRegistration(), email: "nope" }, IP);
    await service.register({ ...createRegistration(), displayName: "A" }, IP);
    await closed.register(createRegistration(), IP);

    expect(hit).not.toHaveBeenCalled();
  });

  it("the window passing restores the budget", async () => {
    let at = 2 * 24 * 60 * 60 * 1_000;
    const { service } = createService({
      now: (): number => {
        return at;
      },
      sendLimiter: createRateLimiter(1, HOUR_MS),
    });

    await service.resendCode("ann@desk.io", IP);
    expect(await service.resendCode("ann@desk.io", IP)).toBe("throttled");

    at += HOUR_MS;

    expect(await service.resendCode("ann@desk.io", IP)).toBe("code_sent");
  });

  it("answers the same for a registered and an unregistered address", async () => {
    const { service } = createService({
      sendLimiter: createRateLimiter(1, HOUR_MS),
    });

    await service.requestReset("trader@rtc.test", IP);
    await service.requestReset("nobody@desk.io", IP);

    expect(await service.requestReset("trader@rtc.test", IP)).toBe("throttled");
    expect(await service.requestReset("nobody@desk.io", IP)).toBe("throttled");
  });

  it("the hourly fuse answers the 26th registration across different addresses unavailable, without a directory call", async () => {
    const { service, directory } = createService({
      maxRegistrationsPerDay: 100,
      sendFuses: createFuses({ signUp: createRateLimiter(25, HOUR_MS) }),
    });
    const signUp = vi.spyOn(directory, "signUp");

    for (let n = 0; n < 25; n += 1) {
      expect(
        await service.register(
          { ...createRegistration(), email: `n${n}@desk.io` },
          IP,
        ),
      ).toEqual({ outcome: "code_sent" });
    }

    expect(
      await service.register(
        { ...createRegistration(), email: "later@desk.io" },
        IP,
      ),
    ).toEqual({ outcome: "unavailable" });
    expect(signUp).toHaveBeenCalledTimes(25);
  });

  const HOUR_MS = 60 * 60 * 1_000;
});

describe("AccountService — sends are looked up first and never awaited", () => {
  it("register answers code_sent while the directory's sign-up is still pending, and settles the daily counters when it resolves (Review Focus 3)", async () => {
    const deferred = createDeferred<SignUpOutcome>();
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp: () => {
        return deferred.promise;
      },
    });
    const service = createDoubleService(directory, 1);

    const answer = await service.register(createRegistration(), IP);

    expect(answer).toEqual({ outcome: "code_sent" });
    // The in-flight sign-up counts against the cap until it settles.
    expect(
      await service.register(
        { ...createRegistration(), email: "bob@desk.io" },
        IP,
      ),
    ).toEqual({ outcome: "closed" });

    deferred.resolve("sent");
    await flushMicrotasks();
    // Settled: nothing in flight any more. The double's count is a constant 0
    // (a real store would now count the first sign-up), so the cap of 1 is
    // open again — which proves the in-flight count was released.
    expect(
      await service.register(
        { ...createRegistration(), email: "cy@desk.io" },
        IP,
      ),
    ).toEqual({ outcome: "code_sent" });
  });

  it("register logs a detached outcome that is not sent, without the address", async () => {
    const lines: string[] = [];
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp: () => {
        return Promise.resolve("rejected-email");
      },
    });

    const service = createAccountService({
      ...createOptions(directory),
      log: (line: string): void => {
        lines.push(line);
      },
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    await flushMicrotasks();

    expect(lines).toEqual([
      "[accounts] detached send route=/register outcome=rejected-email",
    ]);
    expect(lines.join()).not.toContain("ann@desk.io");
  });

  it("register charges the sign-up fuse after the count, so a closed registration spends nothing", async () => {
    const fuse = createRateLimiter(1, 60_000);
    const { service } = createService({
      maxRegistrationsPerDay: 0,
      sendFuses: createFuses({ signUp: fuse }),
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "closed",
    });
    expect(fuse.peek("all", 0)).toBe(true);
  });

  it.each([
    ["resendCode", "trader@rtc.test", "active"],
    ["resendCode", "nobody@desk.io", "missing"],
    ["requestReset", "blocked@rtc.test", "blocked"],
    ["requestReset", "nobody@desk.io", "missing"],
  ] as const)(
    "%s for %s (%s) answers code_sent and sends nothing",
    async (path, email, _status) => {
      const { service, directory } = createService();
      const resend = vi.spyOn(directory, "resendCode");
      const reset = vi.spyOn(directory, "requestReset");

      expect(await service[path](email, IP)).toBe("code_sent");

      expect(resend).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
    },
  );

  it("requestReset sends for neither an unconfirmed nor a blocked account, and resendCode for no confirmed one", async () => {
    const { service, directory } = createService();
    await directory.signUp({ email: "ann@desk.io", displayName: "Ann" }, IP);
    const resend = vi.spyOn(directory, "resendCode");
    const reset = vi.spyOn(directory, "requestReset");

    expect(await service.requestReset("ann@desk.io", IP)).toBe("code_sent");
    expect(await service.resendCode("pending@rtc.test", IP)).toBe("code_sent");

    expect(resend).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("resendCode sends for an unconfirmed account and requestReset for a pending or active one, each charging only its own fuse", async () => {
    const fuses = createFuses({
      resend: createRateLimiter(1, 60_000),
      reset: createRateLimiter(2, 60_000),
    });
    const { service, directory } = createService({ sendFuses: fuses });
    await directory.signUp({ email: "ann@desk.io", displayName: "Ann" }, IP);
    const resend = vi.spyOn(directory, "resendCode");
    const reset = vi.spyOn(directory, "requestReset");

    expect(await service.resendCode("ann@desk.io", IP)).toBe("code_sent");
    expect(await service.requestReset("pending@rtc.test", IP)).toBe(
      "code_sent",
    );
    expect(await service.requestReset("trader@rtc.test", IP)).toBe("code_sent");
    await flushMicrotasks();

    expect(resend).toHaveBeenCalledWith("ann@desk.io", IP);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(fuses.resend.peek("all", createClock()())).toBe(false);
    expect(fuses.reset.peek("all", createClock()())).toBe(false);
    expect(fuses.signUp.peek("all", createClock()())).toBe(true);
  });

  it("a fuse that goes spent between the peek and the hit answers unavailable and sends nothing", async () => {
    const hit = vi.fn((): boolean => {
      return false;
    });

    const { service, directory } = createService({
      sendFuses: createFuses({
        reset: {
          hit,
          peek: () => {
            return true;
          },
        },
      }),
    });
    const reset = vi.spyOn(directory, "requestReset");

    expect(await service.requestReset("trader@rtc.test", IP)).toBe(
      "unavailable",
    );
    expect(reset).not.toHaveBeenCalled();
  });

  it("a spent fuse refuses a missing address too, so the refusal says nothing about the address (Review Focus 4)", async () => {
    const resend = createRateLimiter(1, 60_000);
    resend.hit("all", createClock()());
    const { service, directory } = createService({
      sendFuses: createFuses({ resend }),
    });
    const lookup = vi.spyOn(directory, "findByEmail");

    expect(await service.resendCode("nobody@desk.io", IP)).toBe("unavailable");
    expect(await service.resendCode("trader@rtc.test", IP)).toBe("unavailable");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("a spent reset fuse refuses a missing address too, without a lookup", async () => {
    const reset = createRateLimiter(1, 60_000);
    reset.hit("all", createClock()());
    const { service, directory } = createService({
      sendFuses: createFuses({ reset }),
    });
    const lookup = vi.spyOn(directory, "findByEmail");

    expect(await service.requestReset("nobody@desk.io", IP)).toBe(
      "unavailable",
    );
    expect(await service.requestReset("trader@rtc.test", IP)).toBe(
      "unavailable",
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("resendCode and requestReset answer unavailable when the lookup cannot be read", async () => {
    const directory = createDoubleDirectory({
      findByEmail: () => {
        return Promise.resolve({ outcome: "unavailable" });
      },
    });
    const service = createAccountService(createOptions(directory));

    expect(await service.resendCode("ann@desk.io", IP)).toBe("unavailable");
    expect(await service.requestReset("ann@desk.io", IP)).toBe("unavailable");
  });

  it("the send is not awaited: a resend answers while the directory's send is pending", async () => {
    const deferred = createDeferred<SendOutcome>();
    const directory = createDoubleDirectory({
      findByEmail: () => {
        return Promise.resolve({
          outcome: "found",
          account: createUnconfirmedRecord(),
        });
      },
      resendCode: () => {
        return deferred.promise;
      },
    });
    const service = createAccountService(createOptions(directory));
    vi.useFakeTimers();

    try {
      const answer = Promise.race([
        service.resendCode("ann@desk.io", IP),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("awaited the send"));
          }, 50);
        }),
      ]);
      await vi.advanceTimersByTimeAsync(50);

      expect(await answer).toBe("code_sent");
    } finally {
      vi.useRealTimers();
      deferred.resolve("unavailable");
      await flushMicrotasks();
    }
  });
});

interface ServiceOverrides {
  readonly registrationOpen?: boolean;
  readonly maxRegistrationsPerDay?: number;
  readonly now?: () => number;
  readonly codeEntryLimiter?: RateLimiter;
  readonly sendLimiter?: RateLimiter;
  readonly sendFuses?: SendFuses;
  readonly log?: (line: string) => void;
}

interface ServiceFixture {
  readonly service: AccountService;
  readonly directory: AccountDirectory;
}

function createService(overrides: ServiceOverrides = {}): ServiceFixture {
  const now = overrides.now ?? createClock();
  const directory = createInMemoryAccountDirectory({
    now,
    seeds: DEV_ACCOUNT_SEEDS,
  });

  const service = createAccountService({
    directory,
    now,
    registrationOpen: overrides.registrationOpen ?? true,
    maxRegistrationsPerDay: overrides.maxRegistrationsPerDay ?? 10,
    codeEntryLimiter:
      overrides.codeEntryLimiter ?? createRateLimiter(100, 60_000),
    sendLimiter: overrides.sendLimiter ?? createRateLimiter(100, 60_000),
    sendFuses: overrides.sendFuses ?? createFuses(),
    log: overrides.log ?? ignoreLog,
  });

  return { service, directory };
}

/** A day past zero, so the seeds (created at 0) fall outside the daily window. */
function createClock(): () => number {
  return (): number => {
    return 2 * 24 * 60 * 60 * 1_000;
  };
}

function createRegistration(): RegisterRequestDto {
  return { email: "ann@desk.io", displayName: "Ann Lee" };
}

function createConfirmation(
  overrides: Partial<ConfirmEmailRequestDto> = {},
): ConfirmEmailRequestDto {
  return {
    email: "ann@desk.io",
    code: DEV_CONFIRMATION_CODE,
    password: PASSWORD,
    ...overrides,
  };
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

function createFuses(overrides: Partial<SendFuses> = {}): SendFuses {
  return {
    signUp: createRateLimiter(100, 60_000),
    resend: createRateLimiter(100, 60_000),
    reset: createRateLimiter(100, 60_000),
    ...overrides,
  };
}

function createOptions(directory: AccountDirectory): AccountServiceOptions {
  return {
    directory,
    now: createClock(),
    registrationOpen: true,
    maxRegistrationsPerDay: 10,
    codeEntryLimiter: createRateLimiter(100, 60_000),
    sendLimiter: createRateLimiter(100, 60_000),
    sendFuses: createFuses(),
    log: ignoreLog,
  };
}

function createUnconfirmedRecord(): AccountRecord {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    email: "ann@desk.io",
    displayName: "Ann",
    access: "user",
    status: "unconfirmed",
  };
}

function ignoreLog(): void {
  // The default sink: a test that asserts a log line passes its own.
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
    codeEntryLimiter: createRateLimiter(100, 60_000),
    sendLimiter: createRateLimiter(100, 60_000),
    sendFuses: createFuses(),
    log: ignoreLog,
  });
}

type SendPath = "register" | "resendCode" | "requestReset";

/** One send through the named path, read as the same small vocabulary. */
async function sendVia(
  service: AccountService,
  path: SendPath,
  email: string,
): Promise<string> {
  if (path === "register") {
    return (await service.register({ email, displayName: "Ann Lee" }, IP))
      .outcome;
  }

  return path === "resendCode"
    ? service.resendCode(email, IP)
    : service.requestReset(email, IP);
}

/** How many times the directory was asked to send, across all three paths. */
function spyOnSends(directory: AccountDirectory): () => number {
  const spies = [
    vi.spyOn(directory, "signUp"),
    vi.spyOn(directory, "resendCode"),
    vi.spyOn(directory, "requestReset"),
  ];

  return (): number => {
    return spies.reduce((total, spy) => {
      return total + spy.mock.calls.length;
    }, 0);
  };
}
