import { describe, expect, it, vi } from "vitest";

import type {
  AccountDirectory,
  ConfirmOutcome,
} from "#/accounts/AccountDirectory";
import { createAccountService } from "#/accounts/AccountService";
import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";
import { DEV_ACCOUNT_SEEDS } from "#/accounts/devAccounts";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
} from "#/accounts/InMemoryAccountDirectory";
import { type BanList, createBanList } from "#/auth/banList";
import { createRateLimiter, type RateLimiter } from "#/auth/rateLimit";
import type { HttpResult } from "#/http/jsonResult";

import {
  type AccountHandlerDeps,
  type AccountRateLimits,
  confirmEmailAddress,
  registerAccount,
  requestPasswordReset,
  resendConfirmationCode,
  resetAccountPassword,
} from "./accountHandlers.js";

describe("registerAccount", () => {
  it("answers 202 code_sent for a valid registration", async () => {
    const result = await registerAccount(
      createRegisterBody(),
      IP,
      createDeps(),
    );

    expect(result.status).toBe(202);
    expect(JSON.parse(result.body)).toEqual({ status: "code_sent" });
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("answers identically for an address that already has an account", async () => {
    const deps = createDeps();
    const fresh = await registerAccount(createRegisterBody(), IP, deps);
    const existing = await registerAccount(
      createRegisterBody({ email: "trader@rtc.test" }),
      IP,
      deps,
    );

    expect(existing.status).toBe(fresh.status);
    expect(existing.body).toBe(fresh.body);
  });

  it("answers 400 with the broken rule", async () => {
    const result = await registerAccount(
      createRegisterBody({ email: "not-an-email" }),
      IP,
      createDeps(),
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "invalid_request",
      rule: "email",
    });
  });

  it("answers 400 for malformed JSON and for a wrong shape", async () => {
    const deps = createDeps();

    expect((await registerAccount("{nope", IP, deps)).status).toBe(400);
    expect(
      JSON.parse(
        (await registerAccount(JSON.stringify({ email: "a@b.io" }), IP, deps))
          .body,
      ),
    ).toEqual({ error: "invalid_request" });
  });

  it("answers 403 when registration is closed", async () => {
    const result = await registerAccount(
      createRegisterBody(),
      IP,
      createDeps({ registrationOpen: false }),
    );

    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ error: "registration_closed" });
  });

  it("answers 503 when the directory is unavailable", async () => {
    const result = await registerAccount(
      createRegisterBody(),
      IP,
      createDeps({ directory: createDisabledAccountDirectory() }),
    );

    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "unavailable" });
  });

  it("a banned caller is answered before the body is parsed or the service asked", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    banList.strike(IP, "login-failed", 500);
    const deps = createDeps({ banList });
    const register = vi.spyOn(deps.accounts, "register");

    const result = await registerAccount("{nope", IP, deps);

    expect(result.status).toBe(429);
    expect(JSON.parse(result.body)).toEqual({ error: "banned" });
    expect(result.headers?.["Retry-After"]).toBe("30");
    expect(register).not.toHaveBeenCalled();
  });

  it("past the rate limit it answers 429 and strikes the caller", async () => {
    const banList = createBanList({
      strikesToBan: 2,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps({ banList, limiter: createRateLimiter(1, 60_000) });

    expect((await registerAccount(createRegisterBody(), IP, deps)).status).toBe(
      202,
    );

    const limited = await registerAccount(createRegisterBody(), IP, deps);

    expect(limited.status).toBe(429);
    expect(JSON.parse(limited.body)).toEqual({ error: "rate_limited" });
    // One rate-limit hit weighs 2 = the threshold.
    expect(banList.isBanned(IP, 1_000)).toBe(true);
  });
});

describe("confirmEmailAddress", () => {
  it("answers 200 pending_approval for the right code, and the password is set", async () => {
    const deps = createDeps();
    await registerAccount(createRegisterBody(), IP, deps);

    const result = await confirmEmailAddress(createConfirmBody(), IP, deps);

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: "pending_approval" });
    expect(
      (await deps.accounts.login("ann@desk.io", PASSWORD, IP)).outcome,
    ).toBe("pending");
  });

  it("answers 200 password_unset when the code held but the password was not stored", async () => {
    const result = await confirmEmailAddress(
      createConfirmBody(),
      IP,
      createDeps({
        directory: {
          ...createDisabledAccountDirectory(),
          confirmEmail: (): Promise<ConfirmOutcome> => {
            return Promise.resolve("confirmed_unset");
          },
        },
      }),
    );

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: "password_unset" });
  });

  it("a weak password is 400 with its rule, and no strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps({ banList });
    await registerAccount(createRegisterBody(), IP, deps);

    const result = await confirmEmailAddress(
      createConfirmBody({ password: "short" }),
      IP,
      deps,
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "invalid_request",
      rule: "min-length",
    });
    expect(banList.isBanned(IP, 1_000)).toBe(false);
  });

  it("a body without the password is 400 and never reaches the service", async () => {
    const deps = createDeps();
    const confirm = vi.spyOn(deps.accounts, "confirmEmail");

    const result = await confirmEmailAddress(
      JSON.stringify({ email: "ann@desk.io", code: DEV_CONFIRMATION_CODE }),
      IP,
      deps,
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_request" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("answers 503 when the directory is unavailable", async () => {
    const result = await confirmEmailAddress(
      createConfirmBody(),
      IP,
      createDeps({ directory: createDisabledAccountDirectory() }),
    );

    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "unavailable" });
  });

  it("a wrong code is 400 and a strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps({ banList });
    await registerAccount(createRegisterBody(), IP, deps);

    const result = await confirmEmailAddress(
      createConfirmBody({ code: "11111111" }),
      IP,
      deps,
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_code" });
    expect(banList.isBanned(IP, 1_000)).toBe(true);
  });
});

describe("resendConfirmationCode and requestPasswordReset", () => {
  it("answer 202 whether or not the address has an account", async () => {
    const deps = createDeps();
    const body = JSON.stringify({ email: "nobody@desk.io" });

    expect((await resendConfirmationCode(body, IP, deps)).status).toBe(202);
    expect((await requestPasswordReset(body, IP, deps)).status).toBe(202);
  });

  it("answer 400 for a malformed address", async () => {
    const deps = createDeps();
    const body = JSON.stringify({ email: "nope" });

    expect((await resendConfirmationCode(body, IP, deps)).status).toBe(400);
    expect((await requestPasswordReset(body, IP, deps)).status).toBe(400);
  });
});

describe("resetAccountPassword", () => {
  it("answers 200 password_changed after a requested reset", async () => {
    const deps = createDeps();
    await requestPasswordReset(
      JSON.stringify({ email: "trader@rtc.test" }),
      IP,
      deps,
    );

    const result = await resetAccountPassword(
      createResetBody("Fresh2026!pass"),
      IP,
      deps,
    );

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: "password_changed" });
  });

  it("a weak new password is 400 with its rule, and no strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });

    const result = await resetAccountPassword(
      createResetBody("weak"),
      IP,
      createDeps({ banList }),
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "invalid_request",
      rule: "min-length",
    });
    expect(banList.isBanned(IP, 1_000)).toBe(false);
  });

  it("a wrong code is 400 and a strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });

    const result = await resetAccountPassword(
      createResetBody("Fresh2026!pass"),
      IP,
      createDeps({ banList }),
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_code" });
    expect(banList.isBanned(IP, 1_000)).toBe(true);
  });
});

describe("code entry per address", () => {
  it("bounds one address across callers: the third attempt from a third IP is 429 and never reaches the directory", async () => {
    const directory = createInMemoryAccountDirectory({
      now: createClock(2 * 24 * 60 * 60 * 1_000),
      seeds: DEV_ACCOUNT_SEEDS,
    });

    const deps = createDeps({
      directory,
      codeEntryLimiter: createRateLimiter(2, 60_000),
    });
    const reset = vi.spyOn(directory, "resetPassword");
    const body = createResetBody("Fresh2026!pass");

    await resetAccountPassword(body, "10.0.0.1", deps);
    await resetAccountPassword(body, "10.0.0.2", deps);
    const third = await resetAccountPassword(body, "10.0.0.3", deps);

    expect(third.status).toBe(429);
    expect(JSON.parse(third.body)).toEqual({ error: "rate_limited" });
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it("another address from the same IP still gets through", async () => {
    const deps = createDeps({
      codeEntryLimiter: createRateLimiter(1, 60_000),
    });
    const reset = vi.spyOn(deps.accounts, "resetPassword");
    await requestResetFor(deps, "trader@rtc.test");
    await requestResetFor(deps, "admin@rtc.test");

    await resetAccountPassword(createResetBody("Fresh2026!pass"), IP, deps);
    const other = await resetAccountPassword(
      createResetBody("Fresh2026!pass", "admin@rtc.test"),
      IP,
      deps,
    );

    expect(other.status).toBe(200);
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it("spellings of one address share one budget", async () => {
    const deps = createDeps({
      codeEntryLimiter: createRateLimiter(1, 60_000),
    });

    await resetAccountPassword(createResetBody("Fresh2026!pass"), IP, deps);
    const respelled = await resetAccountPassword(
      createResetBody("Fresh2026!pass", " Trader@RTC.test "),
      IP,
      deps,
    );

    expect(respelled.status).toBe(429);
  });

  it("confirm and reset share one budget", async () => {
    const deps = createDeps({
      codeEntryLimiter: createRateLimiter(1, 60_000),
    });

    await resetAccountPassword(
      createResetBody("Fresh2026!pass", "ann@desk.io"),
      IP,
      deps,
    );
    const result = await confirmEmailAddress(createConfirmBody(), IP, deps);

    expect(result.status).toBe(429);
    expect(JSON.parse(result.body)).toEqual({ error: "rate_limited" });
  });

  it("the 429 adds no strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });

    const deps = createDeps({
      banList,
      codeEntryLimiter: createRateLimiter(1, 60_000),
    });
    await requestResetFor(deps, "trader@rtc.test");

    await resetAccountPassword(createResetBody("Fresh2026!pass"), IP, deps);
    const limited = await resetAccountPassword(
      createResetBody("Fresh2026!pass"),
      IP,
      deps,
    );

    expect(limited.status).toBe(429);
    expect(banList.isBanned(IP, 1_000)).toBe(false);
  });

  it("a malformed body is not charged to any address", async () => {
    const limiter = createRateLimiter(1, 60_000);
    const deps = createDeps({ codeEntryLimiter: limiter });
    await requestResetFor(deps, "trader@rtc.test");

    await resetAccountPassword("{nope", IP, deps);
    const result = await resetAccountPassword(
      createResetBody("Fresh2026!pass"),
      IP,
      deps,
    );

    expect(result.status).toBe(200);
  });
});

describe("sending per address", () => {
  it.each([
    ["registerAccount", registerAccount, createRegisterBody()],
    [
      "resendConfirmationCode",
      resendConfirmationCode,
      JSON.stringify({ email: "ann@desk.io" }),
    ],
    [
      "requestPasswordReset",
      requestPasswordReset,
      JSON.stringify({ email: "ann@desk.io" }),
    ],
  ])(
    "%s answers 429 rate_limited once the address's sends are spent, with no strike",
    async (_name: string, handler: Handler, body: string) => {
      const banList = createBanList({
        strikesToBan: 1,
        strikeWindowMs: 60_000,
        banMs: 30_000,
        maxEntries: 10,
      });

      const deps = createDeps({
        banList,
        sendLimiter: createRateLimiter(1, 60_000),
      });

      expect((await handler(body, IP, deps)).status).toBe(202);

      const limited = await handler(body, IP, deps);

      expect(limited.status).toBe(429);
      expect(JSON.parse(limited.body)).toEqual({ error: "rate_limited" });
      expect(banList.isBanned(IP, 1_000)).toBe(false);
    },
  );

  it("a blown hourly fuse answers a registration 503 unavailable", async () => {
    const deps = createDeps({ sendFuse: createRateLimiter(1, 60_000) });

    await registerAccount(createRegisterBody(), IP, deps);
    const result = await registerAccount(
      createRegisterBody({ email: "bob@desk.io" }),
      IP,
      deps,
    );

    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "unavailable" });
    expect(
      (
        await requestPasswordReset(
          JSON.stringify({ email: "cy@desk.io" }),
          IP,
          deps,
        )
      ).status,
    ).toBe(202);
  });
});

describe("limiter wiring", () => {
  it("each endpoint charges its own limiter", async () => {
    const spent = createRateLimiter(1, 60_000);
    spent.hit(IP, 1_000);
    const emailBody = JSON.stringify({ email: "nobody@desk.io" });

    const registerSpent = createDeps({ limits: { register: spent } });
    expect(
      (await registerAccount(createRegisterBody(), IP, registerSpent)).status,
    ).toBe(429);
    expect(
      (await resendConfirmationCode(emailBody, IP, registerSpent)).status,
    ).toBe(202);

    const confirmSpent = createDeps({ limits: { confirmEmail: spent } });
    await requestResetFor(confirmSpent, "trader@rtc.test");
    expect(
      (await confirmEmailAddress(createConfirmBody(), IP, confirmSpent)).status,
    ).toBe(429);
    expect(
      (
        await resetAccountPassword(
          createResetBody("Fresh2026!pass"),
          IP,
          confirmSpent,
        )
      ).status,
    ).toBe(200);

    const resetSpent = createDeps({ limits: { resetPassword: spent } });
    expect(
      (
        await resetAccountPassword(
          createResetBody("Fresh2026!pass"),
          IP,
          resetSpent,
        )
      ).status,
    ).toBe(429);
    expect((await requestPasswordReset(emailBody, IP, resetSpent)).status).toBe(
      202,
    );
  });

  it("resend and request-reset have separate limiters", async () => {
    const spent = createRateLimiter(1, 60_000);
    spent.hit(IP, 1_000);
    const body = JSON.stringify({ email: "nobody@desk.io" });

    const resendSpent = createDeps({ limits: { resendCode: spent } });
    expect((await resendConfirmationCode(body, IP, resendSpent)).status).toBe(
      429,
    );
    expect((await requestPasswordReset(body, IP, resendSpent)).status).toBe(
      202,
    );

    const requestSpent = createDeps({ limits: { requestReset: spent } });
    expect((await requestPasswordReset(body, IP, requestSpent)).status).toBe(
      429,
    );
    expect((await resendConfirmationCode(body, IP, requestSpent)).status).toBe(
      202,
    );
  });

  it("a banned caller with a spent limiter is told banned, not rate_limited", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    banList.strike(IP, "login-failed", 500);
    const spent = createRateLimiter(1, 60_000);
    spent.hit(IP, 1_000);
    const deps = createDeps({ banList, limits: { register: spent } });

    const result = await registerAccount(createRegisterBody(), IP, deps);

    expect(result.status).toBe(429);
    expect(JSON.parse(result.body)).toEqual({ error: "banned" });
  });
});

describe("enumeration and malformed bodies", () => {
  it("resend-code and request-reset answer a registered and an unregistered address identically", async () => {
    const deps = createDeps();
    const registered = JSON.stringify({ email: "trader@rtc.test" });
    const unregistered = JSON.stringify({ email: "nobody@desk.io" });

    for (const handler of [resendConfirmationCode, requestPasswordReset]) {
      const known = await handler(registered, IP, deps);
      const unknown = await handler(unregistered, IP, deps);

      expect(known.status).toBe(unknown.status);
      expect(known.body).toBe(unknown.body);
    }
  });

  it("malformed JSON answers the malformed_json body on every endpoint", async () => {
    const deps = createDeps();

    for (const handler of [
      registerAccount,
      resendConfirmationCode,
      confirmEmailAddress,
      requestPasswordReset,
      resetAccountPassword,
    ]) {
      const result = await handler("{nope", IP, deps);

      expect(result.status).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: "malformed_json" });
    }
  });
});

type Handler = (
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
) => Promise<HttpResult>;

async function requestResetFor(
  deps: AccountHandlerDeps,
  email: string,
): Promise<void> {
  await deps.accounts.requestReset(email, IP);
}

interface DepsOverrides {
  readonly directory?: AccountDirectory;
  readonly banList?: BanList;
  readonly limiter?: RateLimiter;
  readonly limits?: Partial<AccountRateLimits>;
  readonly codeEntryLimiter?: RateLimiter;
  readonly sendLimiter?: RateLimiter;
  readonly sendFuse?: RateLimiter;
  readonly registrationOpen?: boolean;
}

/** Permissive defaults: generous limiters and a ban list no test reaches. */
function createDeps(overrides: DepsOverrides = {}): AccountHandlerDeps {
  const now = createClock(2 * 24 * 60 * 60 * 1_000);

  const limiter = overrides.limiter ?? createRateLimiter(100, 60_000);

  return {
    accounts: createAccountService({
      directory:
        overrides.directory ??
        createInMemoryAccountDirectory({ now, seeds: DEV_ACCOUNT_SEEDS }),
      now,
      registrationOpen: overrides.registrationOpen ?? true,
      maxRegistrationsPerDay: 100,
      codeEntryLimiter:
        overrides.codeEntryLimiter ?? createRateLimiter(100, 60_000),
      sendLimiter: overrides.sendLimiter ?? createRateLimiter(100, 60_000),
      sendFuse: overrides.sendFuse ?? createRateLimiter(100, 60_000),
    }),
    banList:
      overrides.banList ??
      createBanList({
        strikesToBan: 100,
        strikeWindowMs: 60_000,
        banMs: 60_000,
        maxEntries: 10,
      }),
    limits: {
      register: limiter,
      resendCode: limiter,
      confirmEmail: limiter,
      requestReset: limiter,
      resetPassword: limiter,
      ...overrides.limits,
    },
    now: createClock(1_000),
  };
}

function createClock(at: number): () => number {
  return (): number => {
    return at;
  };
}

interface RegisterOverrides {
  readonly email?: string;
}

function createRegisterBody(overrides: RegisterOverrides = {}): string {
  return JSON.stringify({
    email: overrides.email ?? "ann@desk.io",
    displayName: "Ann Lee",
  });
}

interface ConfirmOverrides {
  readonly code?: string;
  readonly password?: string;
}

function createConfirmBody(overrides: ConfirmOverrides = {}): string {
  return JSON.stringify({
    email: "ann@desk.io",
    code: overrides.code ?? DEV_CONFIRMATION_CODE,
    password: overrides.password ?? PASSWORD,
  });
}

function createResetBody(
  password: string,
  email: string = "trader@rtc.test",
): string {
  return JSON.stringify({
    email,
    code: DEV_CONFIRMATION_CODE,
    password,
  });
}

const IP = "1.2.3.4";

const PASSWORD = "Mcdc2026!desk";
