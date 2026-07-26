import { isLoginRequestDto, type LoginResponseDto } from "@rtc/shared";

import type { AuthService } from "../auth/AuthService.js";
import type { RateLimiter } from "../auth/rateLimit.js";

const JSON_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export interface LoginHandlerDeps {
  readonly auth: AuthService;
  readonly rateLimit: RateLimiter;
  readonly now: () => number;
}

export interface LoginHandlerResult {
  readonly status: 200 | 400 | 401 | 429;
  readonly body: string;
  readonly headers?: Record<string, string>;
}

function jsonResult(
  status: LoginHandlerResult["status"],
  body: unknown,
): LoginHandlerResult {
  return { status, body: JSON.stringify(body), headers: JSON_CORS_HEADERS };
}

/**
 * Pure `/login` request handler: rate-limits by caller IP, validates the
 * request shape, then delegates credential checking to `AuthService`. No
 * real HTTP server is needed to test it — `index.ts` wires `node:http`
 * request/response objects to this function.
 */
export function authenticateLoginRequest(
  bodyText: string,
  ip: string,
  deps: LoginHandlerDeps,
): LoginHandlerResult {
  if (!deps.rateLimit.hit(ip, deps.now())) {
    return jsonResult(429, { error: "rate_limited" });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return jsonResult(400, { error: "malformed_json" });
  }

  if (!isLoginRequestDto(parsed)) {
    return jsonResult(400, { error: "invalid_request" });
  }

  const result = deps.auth.login(parsed.username, parsed.password);

  if (result === null) {
    return jsonResult(401, { error: "invalid_credentials" });
  }

  const response: LoginResponseDto = {
    token: result.token,
    user: result.user,
    exp: deps.now() + deps.auth.ttlMs,
  };

  return jsonResult(200, response);
}

/**
 * WebSocket upgrade authorization. The browser cannot set headers on a
 * `WebSocket`, so the freshly-issued session token rides in the `?access=`
 * query param. Strict: a missing URL, missing param, or a token that fails
 * `AuthService.verifyToken` (bad signature, wrong secret, or expired) is
 * always rejected — there is no open-when-empty fallback.
 */
export function authorizeUpgrade(
  reqUrl: string | undefined,
  auth: AuthService,
): boolean {
  return describeUpgrade(reqUrl, auth).ok;
}

/** Why an upgrade was rejected — surfaced so the server can log the difference
 * between a client that never authenticated (`no-token`, the pre-login case)
 * and one whose token failed verification (`invalid-token`, e.g. an expired
 * session). `no-url` is a malformed request with no URL at all. */
export type UpgradeRejection = "no-url" | "no-token" | "invalid-token";

export interface UpgradeDecision {
  readonly ok: boolean;
  readonly reason?: UpgradeRejection;
}

/** The reason-carrying core of {@link authorizeUpgrade}. Same strict policy —
 * missing URL / missing `?access=` / unverifiable token all reject — but names
 * which one, without ever returning or logging the token itself. */
export function describeUpgrade(
  reqUrl: string | undefined,
  auth: AuthService,
): UpgradeDecision {
  if (reqUrl === undefined) {
    return { ok: false, reason: "no-url" };
  }

  const url = new URL(reqUrl, "http://localhost");
  const access = url.searchParams.get("access");

  if (access === null) {
    return { ok: false, reason: "no-token" };
  }

  if (auth.verifyToken(access) === null) {
    return { ok: false, reason: "invalid-token" };
  }

  return { ok: true };
}
