import { describe, expect, it } from "vitest";

import type { LoginResponseDto } from "@rtc/shared";

import { AuthService, parseAuthUsers } from "#/auth/AuthService";
import { createRateLimiter } from "#/auth/rateLimit";

import { authorizeUpgrade, handleLogin } from "./loginHandler.js";

describe("handleLogin", () => {
  it("returns 429 when the caller is rate-limited", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    const rateLimit = createRateLimiter(1, 60_000);
    const deps = {
      auth,
      rateLimit,
      now: (): number => {
        return 1_000;
      },
    };
    const body = JSON.stringify({ username: "demo", password: "localpass" });

    expect(handleLogin(body, "1.2.3.4", deps).status).toBe(200);
    expect(handleLogin(body, "1.2.3.4", deps).status).toBe(429);
  });

  it("returns 400 on malformed JSON", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    const rateLimit = createRateLimiter(10, 60_000);
    const deps = {
      auth,
      rateLimit,
      now: (): number => {
        return 1_000;
      },
    };

    const result = handleLogin("{not json", "1.2.3.4", deps);
    expect(result.status).toBe(400);
  });

  it("returns 400 on a well-formed but invalid shape", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    const rateLimit = createRateLimiter(10, 60_000);
    const deps = {
      auth,
      rateLimit,
      now: (): number => {
        return 1_000;
      },
    };

    const result = handleLogin(
      JSON.stringify({ username: "demo" }),
      "1.2.3.4",
      deps,
    );
    expect(result.status).toBe(400);
  });

  it("returns 401 on bad credentials", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    const rateLimit = createRateLimiter(10, 60_000);
    const deps = {
      auth,
      rateLimit,
      now: (): number => {
        return 1_000;
      },
    };

    const body = JSON.stringify({ username: "demo", password: "wrong" });
    const result = handleLogin(body, "1.2.3.4", deps);
    expect(result.status).toBe(401);
  });

  it("returns 200 with a valid LoginResponseDto on success, with CORS headers", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    const rateLimit = createRateLimiter(10, 60_000);
    const deps = {
      auth,
      rateLimit,
      now: (): number => {
        return 1_000;
      },
    };

    const body = JSON.stringify({ username: "demo", password: "localpass" });
    const result = handleLogin(body, "1.2.3.4", deps);

    expect(result.status).toBe(200);
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
    expect(result.headers?.["Content-Type"]).toBe("application/json");

    const parsed = JSON.parse(result.body) as LoginResponseDto;
    expect(typeof parsed.token).toBe("string");
    expect(parsed.user.name).toBe("Demo Operator");
    expect(parsed.exp).toBe(1_000 + TTL_MS);
  });
});

describe("authorizeUpgrade", () => {
  it("accepts a freshly-signed token", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    const login = auth.login("demo", "localpass");

    if (login === null) {
      throw new Error("expected login to succeed");
    }

    expect(authorizeUpgrade(`/?access=${login.token}`, auth)).toBe(true);
  });

  it("rejects a garbage token", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    expect(authorizeUpgrade("/?access=garbage", auth)).toBe(false);
  });

  it("rejects a missing token or url", () => {
    const auth = makeAuth((): number => {
      return 1_000;
    });
    expect(authorizeUpgrade("/", auth)).toBe(false);
    expect(authorizeUpgrade(undefined, auth)).toBe(false);
  });
});

const TTL_MS = 60_000;

function makeAuth(now: () => number): AuthService {
  return new AuthService({
    secret: "s3cret",
    ttlMs: TTL_MS,
    credentials: parseAuthUsers("demo:localpass"),
    now,
  });
}
