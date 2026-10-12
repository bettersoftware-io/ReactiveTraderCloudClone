/**
 * The B2a account journey over the REAL server and its in-memory account
 * directory (`RTC_DEV_ACCOUNTS=1`, set by `startServer`): register, no
 * password until the address is confirmed, refused until approved; a seeded
 * blocked account is refused; a seeded active one signs in, opens a
 * WebSocket, is refused on `/mcp` and resets its password. The unit tests
 * cover each rule; this proves they are wired to real routes.
 *
 * Every request carries its own `Fly-Client-IP`, so the journey shares no
 * rate-limit bucket or strike table with the other smoke checks. It sends at
 * most three emails per address (`SEND_PER_ADDRESS_MAX`): two registrations
 * for the new address, one reset request for the active seed.
 */
import { createHmac } from "node:crypto";

import { WebSocket } from "ws";

import { SMOKE_AUTH_SECRET } from "./_orchestration.ts";

/** A documentation-range address unique to this run (RFC 5737). */
const JOURNEY_IP = `198.51.100.${1 + (Date.now() % 254)}`;
const DEV_PASSWORD = "Mcdc2026!desk";
const NEW_PASSWORD = "Reset2026!desk";
const DEV_CODE = "00000000";
const WRONG_CODE = "11111111";
const ACTIVE_SEED = "trader@rtc.test";
const BLOCKED_SEED = "blocked@rtc.test";
const SOCKET_TIMEOUT_MS = 10_000;
const FORGED_TTL_MS = 60_000;
/** The seeds' ids in `packages/server/src/accounts/devAccounts.ts`. */
const ACTIVE_SEED_ID = "00000000-0000-4000-8000-000000000002";
const BLOCKED_SEED_ID = "00000000-0000-4000-8000-000000000004";
/** A well-formed account id no seed or registration has. */
const MISSING_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000ff";

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    throw new Error(`assertion failed: ${message}`);
  }
}

async function post(
  httpBase: string,
  path: string,
  payload: Record<string, string>,
): Promise<Answer> {
  const response = await fetch(`${httpBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Fly-Client-IP": JOURNEY_IP,
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

/** Opens a socket with the token and resolves true once it is open. */
function opensSocket(wsBase: string, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new WebSocket(
      `${wsBase}/?access=${encodeURIComponent(token)}`,
      { headers: { "Fly-Client-IP": JOURNEY_IP } },
    );

    const timer = setTimeout(() => {
      socket.close();
      resolve(false);
    }, SOCKET_TIMEOUT_MS);

    socket.on("open", () => {
      clearTimeout(timer);
      socket.close();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function describe(answer: Answer, field: string): string {
  return `${answer.status} ${String(answer.body[field])}`;
}

async function runRegistrationLeg(httpBase: string): Promise<void> {
  const email = `journey-${Date.now()}@rtc.test`;
  const credentials = { username: email, password: DEV_PASSWORD };

  const health = await fetch(`${httpBase}/health/accounts`, {
    headers: { "Fly-Client-IP": JOURNEY_IP },
  });
  const healthBody = (await health.json()) as Record<string, unknown>;
  assert(
    healthBody.directory === "in-memory",
    `/health/accounts directory (got ${String(healthBody.directory)})`,
  );

  const registered = await post(httpBase, "/register", {
    email,
    displayName: "Journey Guest",
  });
  assert(
    registered.status === 202 && registered.body.status === "code_sent",
    `register (got ${describe(registered, "status")})`,
  );

  const again = await post(httpBase, "/register", {
    email,
    displayName: "Someone Else",
  });
  assert(
    again.status === registered.status &&
      JSON.stringify(again.body) === JSON.stringify(registered.body),
    `re-register answers identically (got ${describe(again, "status")})`,
  );

  const unconfirmed = await post(httpBase, "/login", credentials);
  assert(
    unconfirmed.status === 401 &&
      unconfirmed.body.error === "invalid_credentials",
    `login before confirming (got ${describe(unconfirmed, "error")})`,
  );

  const wrongCode = await post(httpBase, "/confirm-email", {
    email,
    code: WRONG_CODE,
    password: DEV_PASSWORD,
  });
  assert(
    wrongCode.status === 400 && wrongCode.body.error === "invalid_code",
    `wrong code (got ${describe(wrongCode, "error")})`,
  );

  const weak = await post(httpBase, "/confirm-email", {
    email,
    code: DEV_CODE,
    password: "weak",
  });
  assert(
    weak.status === 400 &&
      weak.body.error === "invalid_request" &&
      weak.body.rule === "min-length",
    `weak password refused with its rule (got ${weak.status} ${String(weak.body.error)} ${String(weak.body.rule)})`,
  );

  const confirmed = await post(httpBase, "/confirm-email", {
    email,
    code: DEV_CODE,
    password: DEV_PASSWORD,
  });
  assert(
    confirmed.status === 200 && confirmed.body.status === "pending_approval",
    `confirm (got ${describe(confirmed, "status")})`,
  );

  const pending = await post(httpBase, "/login", credentials);
  assert(
    pending.status === 403 && pending.body.error === "pending_approval",
    `login before approval (got ${describe(pending, "error")})`,
  );
  console.log(
    "  ✓ accounts: register → no password until confirmed → confirmed → pending approval",
  );
}

async function postToMcp(httpBase: string, token: string): Promise<Answer> {
  const response = await fetch(`${httpBase}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Fly-Client-IP": JOURNEY_IP,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function runSeededAccountsLeg(
  httpBase: string,
  wsBase: string,
): Promise<void> {
  const blocked = await post(httpBase, "/login", {
    username: BLOCKED_SEED,
    password: DEV_PASSWORD,
  });
  assert(
    blocked.status === 403 && blocked.body.error === "blocked",
    `blocked account (got ${describe(blocked, "error")})`,
  );

  const active = await post(httpBase, "/login", {
    username: ACTIVE_SEED,
    password: DEV_PASSWORD,
  });
  assert(active.status === 200, `active account (got ${active.status})`);
  const token = active.body.token;
  assert(typeof token === "string", "active login carries a token");
  assert(
    await opensSocket(wsBase, token),
    "an active account's token opens a WebSocket",
  );

  const mcp = await postToMcp(httpBase, token);
  const mcpError = mcp.body.error as { message?: string } | undefined;
  assert(
    mcp.status === 403 && mcpError?.message === "account_tokens_not_accepted",
    `account token on /mcp (got ${mcp.status} ${String(mcpError?.message)})`,
  );

  const requested = await post(httpBase, "/request-reset", {
    email: ACTIVE_SEED,
  });
  assert(
    requested.status === 202 && requested.body.status === "code_sent",
    `request reset (got ${describe(requested, "status")})`,
  );

  const reset = await post(httpBase, "/reset-password", {
    email: ACTIVE_SEED,
    code: DEV_CODE,
    password: NEW_PASSWORD,
  });
  assert(
    reset.status === 200 && reset.body.status === "password_changed",
    `reset password (got ${describe(reset, "status")})`,
  );

  const renewed = await post(httpBase, "/login", {
    username: ACTIVE_SEED,
    password: NEW_PASSWORD,
  });
  assert(
    renewed.status === 200,
    `login with new password (got ${renewed.status})`,
  );

  const stale = await post(httpBase, "/login", {
    username: ACTIVE_SEED,
    password: DEV_PASSWORD,
  });
  assert(stale.status === 401, `login with old password (got ${stale.status})`);

  // The upgrade re-checks the account's status in the directory, so a
  // validly signed token is not enough. The control proves a token signed
  // here is accepted at all — without it a wrong secret would make the two
  // refusals below pass vacuously.
  assert(
    await opensSocket(wsBase, signAccountToken(ACTIVE_SEED, ACTIVE_SEED_ID)),
    "a token signed here for the active seed opens a socket (control: the format and secret match the server's)",
  );
  assert(
    !(await opensSocket(
      wsBase,
      signAccountToken(BLOCKED_SEED, BLOCKED_SEED_ID),
    )),
    "a blocked account's validly signed token cannot open a socket",
  );
  assert(
    !(await opensSocket(
      wsBase,
      signAccountToken("ghost@rtc.test", MISSING_ACCOUNT_ID),
    )),
    "a validly signed token for an account that does not exist cannot open a socket",
  );
  console.log(
    "  ✓ accounts: blocked refused; an active account signs in, connects, is refused on /mcp, and resets its password; a blocked account's token cannot open a socket",
  );
}

/**
 * An account session token in the server's format
 * (`packages/server/src/auth/token.ts` `signToken`): base64url JSON
 * `{u, exp, id, a}`, a dot, then its HMAC-SHA256 under the server's secret.
 * Reproduced rather than imported: the tests program's `rootDir` is
 * `tests/`, so it cannot compile a server source file. The active-seed
 * control above fails loudly if this ever drifts from the real format.
 */
function signAccountToken(email: string, accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      u: email,
      exp: Date.now() + FORGED_TTL_MS,
      id: accountId,
      a: "user",
    }),
  ).toString("base64url");

  const signature = createHmac("sha256", SMOKE_AUTH_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export async function runAccountsJourney(
  httpBase: string,
  wsBase: string,
): Promise<void> {
  await runRegistrationLeg(httpBase);
  await runSeededAccountsLeg(httpBase, wsBase);
}
