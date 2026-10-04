import { describe, expect, it, vi } from "vitest";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import { createAccountService } from "#/accounts/AccountService";
import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";
import { DEV_ACCOUNT_SEEDS } from "#/accounts/devAccounts";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
} from "#/accounts/InMemoryAccountDirectory";
import { type BanList, createBanList } from "#/auth/banList";
import { createRateLimiter, type RateLimiter } from "#/auth/rateLimit";

import {
  type AccountHandlerDeps,
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
      createRegisterBody({ password: "short" }),
      IP,
      createDeps(),
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "invalid_request",
      rule: "min-length",
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
  it("answers 200 pending_approval for the right code", async () => {
    const deps = createDeps();
    await registerAccount(createRegisterBody(), IP, deps);

    const result = await confirmEmailAddress(
      JSON.stringify({ email: "ann@desk.io", code: DEV_CONFIRMATION_CODE }),
      IP,
      deps,
    );

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: "pending_approval" });
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
      JSON.stringify({ email: "ann@desk.io", code: "111111" }),
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

interface DepsOverrides {
  readonly directory?: AccountDirectory;
  readonly banList?: BanList;
  readonly limiter?: RateLimiter;
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
  readonly password?: string;
}

function createRegisterBody(overrides: RegisterOverrides = {}): string {
  return JSON.stringify({
    email: overrides.email ?? "ann@desk.io",
    displayName: "Ann Lee",
    password: overrides.password ?? PASSWORD,
  });
}

function createResetBody(password: string): string {
  return JSON.stringify({
    email: "trader@rtc.test",
    code: DEV_CONFIRMATION_CODE,
    password,
  });
}

const IP = "1.2.3.4";

const PASSWORD = "Mcdc2026!desk";
