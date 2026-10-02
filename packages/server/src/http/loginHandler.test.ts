import { describe, expect, it, vi } from "vitest";

import type { LoginResponseDto } from "@rtc/shared";

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

  it("returns 200 with a valid LoginResponseDto on success, with CORS headers", async () => {
    const deps = createDeps(createAuth(createClock(1_000)));

    const result = await authenticateLoginRequest(
      createLoginBody("demo", "localpass"),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(200);
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
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
    });
  });
});

const TTL_MS = 60_000;

interface DepsOverrides {
  readonly rateLimit?: RateLimiter;
  readonly banList?: BanList;
  readonly now?: () => number;
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
    now: overrides.now ?? createClock(1_000),
  };
}

function createLoginBody(username: string, password: string): string {
  return JSON.stringify({ username, password });
}
