import { afterEach, describe, expect, it, vi } from "vitest";

import type { LoginResponseDto } from "@rtc/shared";

import {
  type AccountService,
  createAccountService,
  type SendFuses,
} from "#/accounts/AccountService";
import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";
import {
  DEV_ACCOUNT_PASSWORD,
  DEV_ACCOUNT_SEEDS,
} from "#/accounts/devAccounts";
import { createInMemoryAccountDirectory } from "#/accounts/InMemoryAccountDirectory";
import { AuthService, parseAuthUsers } from "#/auth/AuthService";
import { type BanList, createBanList } from "#/auth/banList";
import { createRateLimiter, type RateLimiter } from "#/auth/rateLimit";

import {
  authenticateLoginRequest,
  authorizeUpgrade,
  describeUpgrade,
  type LoginHandlerDeps,
} from "./loginHandler.js";

describe("authenticateLoginRequest", () => {
  it("signs a registered, active account in with its derived profile and claims", async () => {
    const auth = createAuth(createClock(1_000));
    const deps = createDeps(auth);

    const result = await authenticateLoginRequest(
      createLoginBody("admin@rtc.test", DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );
    const parsed = JSON.parse(result.body) as LoginResponseDto;

    expect(result.status).toBe(200);
    expect(parsed.user.name).toBe("Desk Admin");
    expect(parsed.user.email).toBe("admin@rtc.test");
    expect(parsed.exp).toBe(1_000 + TTL_MS);
    expect(auth.verifyToken(parsed.token)).toEqual({
      username: "admin@rtc.test",
      accountId: "00000000-0000-4000-8000-000000000001",
      access: "admin",
    });
  });

  it.each([
    ["pending@rtc.test", "pending_approval"],
    ["blocked@rtc.test", "blocked"],
  ])("refuses %s with 403 %s and no strike", async (email, error) => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps(createAuth(createClock(1_000)), { banList });

    const result = await authenticateLoginRequest(
      createLoginBody(email, DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ error });
    expect(banList.isBanned("1.2.3.4", 1_000)).toBe(false);
  });

  it("refuses a registered but unconfirmed address with 403 unconfirmed and no strike", async () => {
    const now = createClock(2 * 24 * 60 * 60 * 1_000);
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });

    const deps = createDeps(createAuth(createClock(1_000)), {
      banList,
      accounts: createAccountService({
        directory: createInMemoryAccountDirectory({
          now,
          seeds: [
            {
              id: "00000000-0000-4000-8000-000000000009",
              email: "fresh@rtc.test",
              displayName: "Fresh Guest",
              access: "user",
              status: "unconfirmed",
            },
          ],
        }),
        now,
        registrationOpen: true,
        maxRegistrationsPerDay: 100,
        codeEntryLimiter: createRateLimiter(100, 60_000),
        sendLimiter: createRateLimiter(100, 60_000),
        sendFuses: createFuses(),
        log: () => {},
      }),
    });

    const result = await authenticateLoginRequest(
      createLoginBody("fresh@rtc.test", DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ error: "unconfirmed" });
    expect(banList.isBanned("1.2.3.4", 1_000)).toBe(false);
  });

  it("a wrong password for a registered address is 401 and a strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps(createAuth(createClock(1_000)), { banList });

    const result = await authenticateLoginRequest(
      createLoginBody("blocked@rtc.test", "Wrong2026!pass"),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_credentials" });
    expect(banList.isBanned("1.2.3.4", 1_000)).toBe(true);
  });

  it("answers 503 for a registered address when the directory is unavailable, and still serves the roster", async () => {
    const deps = createDeps(createAuth(createClock(1_000)), {
      accounts: createAccountService({
        directory: createDisabledAccountDirectory(),
        now: createClock(1_000),
        registrationOpen: true,
        maxRegistrationsPerDay: 100,
        codeEntryLimiter: createRateLimiter(100, 60_000),
        sendLimiter: createRateLimiter(100, 60_000),
        sendFuses: createFuses(),
        log: () => {},
      }),
    });

    const account = await authenticateLoginRequest(
      createLoginBody("trader@rtc.test", DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );

    const roster = await authenticateLoginRequest(
      createLoginBody("demo", "localpass"),
      "1.2.3.4",
      deps,
    );

    expect(account.status).toBe(503);
    expect(JSON.parse(account.body)).toEqual({ error: "unavailable" });
    expect(roster.status).toBe(200);
  });

  it("never sends a roster username to the account service", async () => {
    const deps = createDeps(createAuth(createClock(1_000)));
    const login = vi.spyOn(deps.accounts, "login");

    await authenticateLoginRequest(
      createLoginBody("demo", "localpass"),
      "1.2.3.4",
      deps,
    );

    expect(login).not.toHaveBeenCalled();
  });

  it("returns 429 when the caller is rate-limited", async () => {
    const deps = createDeps(createAuth(createClock(1_000)), {
      rateLimit: createRateLimiter(1, 60_000),
    });
    const body = createLoginBody("demo", "localpass");

    expect((await authenticateLoginRequest(body, "1.2.3.4", deps)).status).toBe(
      200,
    );
    expect((await authenticateLoginRequest(body, "1.2.3.4", deps)).status).toBe(
      429,
    );
  });

  it("returns 400 on malformed JSON", async () => {
    const deps = createDeps(createAuth(createClock(1_000)));

    const result = await authenticateLoginRequest("{not json", "1.2.3.4", deps);
    expect(result.status).toBe(400);
  });

  it("returns 400 on a well-formed but invalid shape", async () => {
    const deps = createDeps(createAuth(createClock(1_000)));

    const result = await authenticateLoginRequest(
      JSON.stringify({ username: "demo" }),
      "1.2.3.4",
      deps,
    );
    expect(result.status).toBe(400);
  });

  it("returns 401 on bad credentials", async () => {
    const deps = createDeps(createAuth(createClock(1_000)));

    const result = await authenticateLoginRequest(
      createLoginBody("demo", "wrong"),
      "1.2.3.4",
      deps,
    );
    expect(result.status).toBe(401);
  });

  it("returns 200 with a valid LoginResponseDto on success, leaving CORS to the router", async () => {
    const deps = createDeps(createAuth(createClock(1_000)));

    const result = await authenticateLoginRequest(
      createLoginBody("demo", "localpass"),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(200);
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(result.headers?.["Content-Type"]).toBe("application/json");

    const parsed = JSON.parse(result.body) as LoginResponseDto;
    expect(typeof parsed.token).toBe("string");
    expect(parsed.user.name).toBe("Demo Operator");
    expect(parsed.exp).toBe(1_000 + TTL_MS);
  });

  it("answers 429 with Retry-After for a banned IP without ever calling auth.login (Review Focus 4)", async () => {
    const auth = createAuth(createClock(1_000));
    const loginSpy = vi.spyOn(auth, "login");
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    banList.strike("1.2.3.4", "login-failed", 500);
    const deps = createDeps(auth, { banList, now: createClock(1_000) });

    const result = await authenticateLoginRequest(
      createLoginBody("demo", "localpass"),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(429);
    expect(result.headers?.["Retry-After"]).toBe("30");
    expect(result.headers?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(result.body)).toEqual({ error: "banned" });
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("a failed login and a rate-limited attempt each count as a strike", async () => {
    const auth = createAuth(createClock(1_000));
    const banList = createBanList({
      strikesToBan: 3,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });

    const deps = createDeps(auth, {
      banList,
      rateLimit: createRateLimiter(1, 60_000),
    });

    expect(
      (
        await authenticateLoginRequest(
          createLoginBody("demo", "wrong"),
          "1.2.3.4",
          deps,
        )
      ).status,
    ).toBe(401);

    expect(
      (
        await authenticateLoginRequest(
          createLoginBody("demo", "wrong"),
          "1.2.3.4",
          deps,
        )
      ).status,
    ).toBe(429);

    expect(banList.isBanned("1.2.3.4", 1_000)).toBe(true);
  });
});

describe("authorizeUpgrade", () => {
  it("accepts a freshly-signed token", async () => {
    const auth = createAuth(createClock(1_000));
    const login = await auth.login("demo", "localpass");

    if (login === null) {
      throw new Error("expected login to succeed");
    }

    expect(authorizeUpgrade(`/?access=${login.token}`, auth)).toBe(true);
  });

  it("rejects a garbage token", () => {
    const auth = createAuth(createClock(1_000));
    expect(authorizeUpgrade("/?access=garbage", auth)).toBe(false);
  });

  it("rejects a missing token or url", () => {
    const auth = createAuth(createClock(1_000));
    expect(authorizeUpgrade("/", auth)).toBe(false);
    expect(authorizeUpgrade(undefined, auth)).toBe(false);
  });
});

describe("describeUpgrade", () => {
  it("names each rejection reason without leaking the token", async () => {
    const auth = createAuth(createClock(1_000));
    const login = await auth.login("demo", "localpass");

    if (login === null) {
      throw new Error("expected login to succeed");
    }

    expect(describeUpgrade(undefined, auth)).toEqual({
      ok: false,
      reason: "no-url",
    });
    expect(describeUpgrade("/", auth)).toEqual({
      ok: false,
      reason: "no-token",
    });
    expect(describeUpgrade("/?access=garbage", auth)).toEqual({
      ok: false,
      reason: "invalid-token",
    });
    expect(describeUpgrade(`/?access=${login.token}`, auth)).toEqual({
      ok: true,
      token: { username: "demo", accountId: null, access: "user" },
    });
  });
});

describe("authenticateLoginRequest — the floor on a failed account login", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not answer an unknown address or a wrong password before 300 ms, measured from the handler's start", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const clock = createClock(1_000);
    const deps = createDeps(createAuth(clock), {
      now: clock,
      wait: (ms: number) => {
        return new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        });
      },
    });
    let settled = false;

    const pending = authenticateLoginRequest(
      createLoginBody("nobody@desk.io", "Wrong2026!desk"),
      "1.2.3.4",
      deps,
    ).then((result) => {
      settled = true;

      return result;
    });

    // The account store hashes on real time; the floor's timer exists only
    // once that decision is in, so let it land before moving fake time.
    while (vi.getTimerCount() === 0) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }

    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(settled).toBe(true);
    expect(result.status).toBe(401);
  });

  it("pads only the remainder: a decision that took 200 ms waits 100 ms more", async () => {
    vi.useFakeTimers();
    let clock = 1_000;
    const accounts = createAccounts();
    const slowAccounts: AccountService = {
      ...accounts,
      login: async (...args) => {
        await new Promise<void>((resolve) => {
          return setTimeout(resolve, 200);
        });
        clock += 200;

        return accounts.login(...args);
      },
    };
    const waits: number[] = [];
    const deps = createDeps(
      createAuth(() => {
        return clock;
      }),
      {
        now: () => {
          return clock;
        },
        accounts: slowAccounts,
        wait: (ms: number) => {
          waits.push(ms);

          return Promise.resolve();
        },
      },
    );

    const pending = authenticateLoginRequest(
      createLoginBody("nobody@desk.io", "Wrong2026!desk"),
      "1.2.3.4",
      deps,
    );
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    expect(waits).toEqual([100]);
  });

  it("does not hold a successful account login or a roster login", async () => {
    const waits: number[] = [];
    const deps = createDeps(createAuth(createClock(1_000)), {
      wait: (ms: number) => {
        waits.push(ms);

        return Promise.resolve();
      },
    });

    await authenticateLoginRequest(
      createLoginBody("admin@rtc.test", DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );
    await authenticateLoginRequest(
      createLoginBody("astark", "mcdc2026"),
      "1.2.3.4",
      deps,
    );

    expect(waits).toEqual([]);
  });
});

const TTL_MS = 60_000;

interface DepsOverrides {
  readonly rateLimit?: RateLimiter;
  readonly banList?: BanList;
  readonly now?: () => number;
  readonly accounts?: AccountService;
  readonly wait?: (ms: number) => Promise<void>;
}

function createAccounts(): AccountService {
  const now = createClock(2 * 24 * 60 * 60 * 1_000);

  return createAccountService({
    directory: createInMemoryAccountDirectory({
      now,
      seeds: DEV_ACCOUNT_SEEDS,
    }),
    now,
    registrationOpen: true,
    maxRegistrationsPerDay: 100,
    codeEntryLimiter: createRateLimiter(100, 60_000),
    sendLimiter: createRateLimiter(100, 60_000),
    sendFuses: createFuses(),
    log: () => {},
  });
}

function createFuses(overrides: Partial<SendFuses> = {}): SendFuses {
  return {
    signUp: createRateLimiter(100, 60_000),
    resend: createRateLimiter(100, 60_000),
    reset: createRateLimiter(100, 60_000),
    ...overrides,
  };
}

function createAuth(now: () => number): AuthService {
  return new AuthService({
    secret: "s3cret",
    ttlMs: TTL_MS,
    credentials: parseAuthUsers("demo:localpass"),
    now,
  });
}

function createClock(at: number): () => number {
  return (): number => {
    return at;
  };
}

/** Permissive defaults: a 10-hit limiter and a ban list no test reaches
 * (100 strikes), so a case overrides only the one edge it is about. */
function createDeps(
  auth: AuthService,
  overrides: DepsOverrides = {},
): LoginHandlerDeps {
  return {
    auth,
    rateLimit: overrides.rateLimit ?? createRateLimiter(10, 60_000),
    banList:
      overrides.banList ??
      createBanList({
        strikesToBan: 100,
        strikeWindowMs: 60_000,
        banMs: 60_000,
        maxEntries: 10,
      }),
    accounts: overrides.accounts ?? createAccounts(),
    now: overrides.now ?? createClock(1_000),
    wait:
      overrides.wait ??
      ((): Promise<void> => {
        return Promise.resolve();
      }),
  };
}

function createLoginBody(username: string, password: string): string {
  return JSON.stringify({ username, password });
}
