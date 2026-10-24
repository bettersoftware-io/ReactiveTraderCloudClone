/**
 * The B2a account journey over the REAL server and its in-memory account
 * directory (`RTC_DEV_ACCOUNTS=1`, set by `startServer`): register, no
 * password until the address is confirmed, refused until approved; a seeded
 * blocked account is refused; a seeded active one signs in, opens a
 * WebSocket and resets its password. The admin leg then drives the account
 * administration RPCs over a real socket: list, approve, a block that closes
 * the account's open socket with 4401, tokens that end (block, reset), the
 * self and non-admin refusals, and the `/mcp` administrator gate. The unit
 * tests cover each rule; this proves they are wired to real routes.
 *
 * Every request carries the one `Fly-Client-IP` of this run (`JOURNEY_IP`),
 * so the journey shares its per-IP buckets with nothing else, and stays under
 * each of them: `/register` 2 of 5, `/resend-code` 1 of 5, `/request-reset`
 * 1 of 5, `/confirm-email` 3 of 10, `/reset-password` 1 of 10, `/login` 9
 * of 10 (`LOGIN_RATE_LIMIT_MAX`, per minute; the roster login for `/mcp` goes
 * through `loginForToken`, which sends no `Fly-Client-IP`). A request
 * refused before its handler (a foreign or null origin, a text/plain body)
 * charges nothing. Per address it stays at or under 2 of the 3 sends
 * (`SEND_PER_ADDRESS_MAX`): two registrations for the new address, one reset
 * request for the active seed, one resend for the origin witnesses' own.
 */
import { createHmac } from "node:crypto";

import { WebSocket } from "ws";

import { SMOKE_AUTH_SECRET } from "./_orchestration.ts";
import { loginForToken } from "./loginForToken.ts";

/** A documentation-range address unique to this run (RFC 5737). */
const JOURNEY_IP = `198.51.100.${1 + (Date.now() % 254)}`;
const DEV_PASSWORD = "Mcdc2026!desk";
const NEW_PASSWORD = "Reset2026!desk";
const DEV_CODE = "00000000";
const WRONG_CODE = "11111111";
const ADMIN_SEED = "admin@rtc.test";
const ACTIVE_SEED = "trader@rtc.test";
const BLOCKED_SEED = "blocked@rtc.test";
const SOCKET_TIMEOUT_MS = 10_000;
const FORGED_TTL_MS = 60_000;
/** The wire names (`CLIENT_MSG.ADMIN_ACCOUNTS_*` in `@rtc/shared`). */
const LIST_ACCOUNTS = "admin.accounts.list";
const APPROVE_ACCOUNT = "admin.accounts.approve";
const BLOCK_ACCOUNT = "admin.accounts.block";
const UNBLOCK_ACCOUNT = "admin.accounts.unblock";
/** `SESSION_ENDED_CLOSE_CODE` in `@rtc/shared`. */
const SESSION_ENDED_CODE = 4401;
/** The seeds' ids in `packages/server/src/accounts/devAccounts.ts`. */
const ADMIN_SEED_ID = "00000000-0000-4000-8000-000000000001";
const ACTIVE_SEED_ID = "00000000-0000-4000-8000-000000000002";
const BLOCKED_SEED_ID = "00000000-0000-4000-8000-000000000004";
/** A well-formed account id no seed or registration has. */
const MISSING_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000ff";

interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    throw new Error(`assertion failed: ${message}`);
  }
}

async function postWith(
  httpBase: string,
  path: string,
  payload: Record<string, string>,
  headers: Record<string, string>,
): Promise<Answer> {
  const response = await fetch(`${httpBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Fly-Client-IP": JOURNEY_IP,
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function post(
  httpBase: string,
  path: string,
  payload: Record<string, string>,
): Promise<Answer> {
  return postWith(httpBase, path, payload, {});
}

function socketUrl(wsBase: string, token: string): string {
  return `${wsBase}/?access=${encodeURIComponent(token)}`;
}

function newSocket(wsBase: string, token: string): WebSocket {
  return new WebSocket(socketUrl(wsBase, token), {
    headers: { "Fly-Client-IP": JOURNEY_IP },
  });
}

/** A live socket and the promise of the code it will close with. */
interface JourneySocket {
  readonly socket: WebSocket;
  /** Resolves with the close code; never rejects. */
  readonly closed: Promise<number>;
}

/** Resolves with the close code, or -1 if no close arrives in time. */
function watchClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(-1);
    }, SOCKET_TIMEOUT_MS);

    socket.on("close", (code: number) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

/** Opens a socket with the token and resolves once it is open. */
function connectSocket(wsBase: string, token: string): Promise<JourneySocket> {
  return new Promise((resolve, reject) => {
    const socket = newSocket(wsBase, token);
    const closed = watchClose(socket);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("socket did not open in time"));
    }, SOCKET_TIMEOUT_MS);

    socket.on("open", () => {
      clearTimeout(timer);
      resolve({ socket, closed });
    });
    socket.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Opens a socket with the token and resolves true once it is open. */
async function opensSocket(wsBase: string, token: string): Promise<boolean> {
  try {
    const { socket } = await connectSocket(wsBase, token);
    socket.close();

    return true;
  } catch {
    return false;
  }
}

/**
 * An ended session is ACCEPTED at the upgrade and closed at once with 4401.
 * Resolves the close code, or -1 when the upgrade was refused or the socket
 * stayed open.
 */
async function closeCodeOfEndedSession(
  wsBase: string,
  token: string,
): Promise<number> {
  try {
    const { socket, closed } = await connectSocket(wsBase, token);
    const code = await closed;
    socket.terminate();

    return code;
  } catch {
    return -1;
  }
}

/** The status the upgrade is refused with, or 0 when it was accepted. */
function upgradeRefusal(wsBase: string, token: string): Promise<number> {
  return new Promise((resolve) => {
    const socket = newSocket(wsBase, token);
    const timer = setTimeout(() => {
      socket.terminate();
      resolve(-1);
    }, SOCKET_TIMEOUT_MS);

    socket.on("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      resolve(response.statusCode ?? -1);
    });
    socket.on("open", () => {
      clearTimeout(timer);
      socket.terminate();
      resolve(0);
    });
    socket.on("error", () => {
      // The refusal arrives as `unexpected-response`; the error follows it.
    });
  });
}

/** An RPC answer on the wire: the ack or nack sits in the payload. */
interface AnswerFrame {
  readonly correlationId?: string;
  readonly payload?: {
    readonly type?: string;
    readonly payload?: Record<string, unknown>;
  };
}

let nextCorrelation = 1;

/**
 * One RPC: send the frame and await the answer carrying its correlationId.
 * The answer frame's payload is `{ type: "ack", payload }` (or `nack`).
 */
function callRpc(
  socket: WebSocket,
  type: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const correlationId = `journey-${nextCorrelation++}`;
    const timer = setTimeout(() => {
      socket.off("message", settleOnAnswer);
      reject(new Error(`${type}: no answer in time`));
    }, SOCKET_TIMEOUT_MS);

    function settleOnAnswer(data: unknown): void {
      const frame = JSON.parse(String(data)) as AnswerFrame;

      if (frame.correlationId === correlationId) {
        clearTimeout(timer);
        socket.off("message", settleOnAnswer);

        if (frame.payload?.type === "ack") {
          resolve(frame.payload.payload ?? {});
        } else {
          reject(new Error(`${type}: nacked`));
        }
      }
    }

    socket.on("message", settleOnAnswer);
    socket.send(JSON.stringify({ type, payload, correlationId }));
  });
}

function describe(answer: Answer, field: string): string {
  return `${answer.status} ${String(answer.body[field])}`;
}

/** Returns the address the journey registered, left pending approval. */
async function runRegistrationLeg(httpBase: string): Promise<string> {
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

  return email;
}

async function runOriginLeg(httpBase: string): Promise<void> {
  const email = `origin-${Date.now()}@rtc.test`;
  const foreign = await postWith(
    httpBase,
    "/register",
    { email, displayName: "Journey" },
    { Origin: "https://evil.example" },
  );
  assert(
    foreign.status === 403 && foreign.body.error === "origin_not_allowed",
    `foreign origin refused (got ${describe(foreign, "error")})`,
  );
  assert(
    foreign.headers.get("access-control-allow-origin") === null,
    "no CORS header for a foreign origin",
  );

  const nullOrigin = await postWith(
    httpBase,
    "/register",
    { email, displayName: "Journey" },
    { Origin: "null" },
  );
  assert(
    nullOrigin.status === 403,
    `null origin refused (got ${nullOrigin.status})`,
  );

  const local = await postWith(
    httpBase,
    "/resend-code",
    { email },
    { Origin: "http://localhost:5173" },
  );
  assert(
    local.status === 202,
    `localhost origin allowed (got ${local.status})`,
  );
  assert(
    local.headers.get("access-control-allow-origin") ===
      "http://localhost:5173",
    "the allowed origin is echoed",
  );
  assert(
    local.headers.get("vary") === "Origin",
    "Vary: Origin on an allowed answer",
  );

  const plain = await fetch(`${httpBase}/resend-code`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Fly-Client-IP": JOURNEY_IP },
    body: JSON.stringify({ email }),
  });
  assert(plain.status === 415, `text/plain refused (got ${plain.status})`);

  console.log(
    "  ✓ accounts: a foreign or null origin is refused, localhost is echoed, text/plain is 415; requests without Origin pass (every other call in this journey)",
  );
}

async function getMcp(httpBase: string, token: string): Promise<number> {
  const response = await fetch(`${httpBase}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Fly-Client-IP": JOURNEY_IP,
    },
  });
  await response.arrayBuffer();

  return response.status;
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
    headers: response.headers,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function runSeededAccountsLeg(
  httpBase: string,
  wsBase: string,
  registeredEmail: string,
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

  const freshToken = await runAdminLeg(
    httpBase,
    wsBase,
    registeredEmail,
    token,
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
  assert(
    (await closeCodeOfEndedSession(wsBase, freshToken)) === SESSION_ENDED_CODE,
    "a token taken before the password reset is accepted, then closed with 4401",
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
  // here is accepted at all — without it a wrong secret would make the
  // witnesses below pass vacuously (a bad signature is a 401 at the upgrade,
  // never a 4401).
  assert(
    await opensSocket(wsBase, signAccountToken(ACTIVE_SEED, ACTIVE_SEED_ID)),
    "a token signed here for the active seed opens a socket (control: the format and secret match the server's)",
  );
  assert(
    (await closeCodeOfEndedSession(
      wsBase,
      signAccountToken(BLOCKED_SEED, BLOCKED_SEED_ID),
    )) === SESSION_ENDED_CODE,
    "a blocked account's validly signed token is accepted, then closed with 4401",
  );
  assert(
    (await closeCodeOfEndedSession(
      wsBase,
      signAccountToken("ghost@rtc.test", MISSING_ACCOUNT_ID),
    )) === SESSION_ENDED_CODE,
    "a validly signed token for an account that does not exist is closed with 4401",
  );
  assert(
    (await upgradeRefusal(wsBase, `${freshToken}x`)) === 401,
    "a token with a forged signature is still refused at the upgrade with 401",
  );
  console.log(
    "  ✓ accounts: blocked refused; an active account signs in, connects and resets its password; a reset, a block and a missing account end a token (4401), a forged one is 401",
  );
}

/**
 * An account session token in the server's format
 * (`packages/server/src/auth/token.ts` `signToken`): base64url JSON
 * `{u, exp, id, a, iat}`, a dot, then its HMAC-SHA256 under the server's secret.
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
      iat: Date.now(),
    }),
  ).toString("base64url");

  const signature = createHmac("sha256", SMOKE_AUTH_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

/** The fields of a listed account the journey reads. */
interface ListedAccount {
  readonly id: string;
  readonly email: string;
  readonly isSelf: boolean;
  readonly status: string;
}

/** The refusal or error message a `/mcp` answer carries. */
interface McpErrorBody {
  readonly message?: string;
}

/** Finds the account with this address in a list answer. */
function accountOf(
  answer: Record<string, unknown>,
  email: string,
): ListedAccount {
  const accounts = answer.accounts as ListedAccount[] | undefined;
  const found = accounts?.find((account) => {
    return account.email === email;
  });
  assert(found !== undefined, "the list holds the account");

  return found;
}

async function loginToken(
  httpBase: string,
  username: string,
  password: string,
): Promise<string> {
  const answer = await post(httpBase, "/login", { username, password });
  assert(answer.status === 200, `login (got ${answer.status})`);
  assert(typeof answer.body.token === "string", "login carries a token");

  return answer.body.token;
}

/**
 * The admin leg: list, approve, block (closes the open socket), unblock (the
 * old token stays ended), self and non-admin refusals, and the `/mcp`
 * administrator gate. Returns a fresh trader token, taken after the unblock,
 * for the reset witness. `traderToken` is the one the seeded leg signed in
 * with, before any of this.
 */
async function runAdminLeg(
  httpBase: string,
  wsBase: string,
  registeredEmail: string,
  traderToken: string,
): Promise<string> {
  const adminToken = await loginToken(httpBase, ADMIN_SEED, DEV_PASSWORD);
  const admin = await connectSocket(wsBase, adminToken);

  // 1. List.
  const listed = await callRpc(admin.socket, LIST_ACCOUNTS, {});
  const accounts = (listed.accounts ?? []) as unknown[];
  assert(
    accounts.length >= 4,
    `the list holds the four seeds (got ${accounts.length})`,
  );
  const self = accountOf(listed, ADMIN_SEED);
  assert(
    self.id === ADMIN_SEED_ID && self.isSelf === true,
    "the administrator's own row is flagged isSelf",
  );
  assert(
    accountOf(listed, ACTIVE_SEED).isSelf === false,
    "another account's row is not isSelf",
  );

  // 2. Approve the account the journey registered.
  const registered = accountOf(listed, registeredEmail);
  assert(registered.status === "pending", "the registered account is pending");
  const approved = await callRpc(admin.socket, APPROVE_ACCOUNT, {
    accountId: registered.id,
  });
  assert(approved.done === true, `approve (got ${JSON.stringify(approved)})`);
  const signedIn = await post(httpBase, "/login", {
    username: registeredEmail,
    password: DEV_PASSWORD,
  });
  assert(
    signedIn.status === 200,
    `the approved account signs in (got ${signedIn.status})`,
  );

  // 3. Block closes the trader's open socket with 4401; a new upgrade with
  //    the same token is accepted, then closed with 4401.
  const trader = await connectSocket(wsBase, traderToken);
  const blocked = await callRpc(admin.socket, BLOCK_ACCOUNT, {
    accountId: ACTIVE_SEED_ID,
  });
  assert(blocked.done === true, `block (got ${JSON.stringify(blocked)})`);
  assert(
    (await trader.closed) === SESSION_ENDED_CODE,
    "blocking closes the account's open socket with 4401",
  );
  assert(
    (await closeCodeOfEndedSession(wsBase, traderToken)) === SESSION_ENDED_CODE,
    "a blocked account's token is accepted at the upgrade, then closed with 4401",
  );

  // 4. Unblock: the old token stays ended (the stamp is after its iat); a
  //    fresh login gives a token whose socket stays open.
  const unblocked = await callRpc(admin.socket, UNBLOCK_ACCOUNT, {
    accountId: ACTIVE_SEED_ID,
  });
  assert(unblocked.done === true, `unblock (got ${JSON.stringify(unblocked)})`);
  assert(
    (await closeCodeOfEndedSession(wsBase, traderToken)) === SESSION_ENDED_CODE,
    "after an unblock the old token is still ended",
  );
  const freshToken = await loginToken(httpBase, ACTIVE_SEED, DEV_PASSWORD);
  const fresh = await connectSocket(wsBase, freshToken);

  // 5. Self.
  const selfBlock = await callRpc(admin.socket, BLOCK_ACCOUNT, {
    accountId: ADMIN_SEED_ID,
  });
  assert(
    selfBlock.error === "self",
    `the administrator cannot block themselves (got ${JSON.stringify(selfBlock)})`,
  );

  // 6. A non-admin. The answer also proves the fresh socket stayed open.
  const forbidden = await callRpc(fresh.socket, LIST_ACCOUNTS, {});
  assert(
    forbidden.error === "forbidden",
    `a non-admin's list is forbidden (got ${JSON.stringify(forbidden)})`,
  );
  fresh.socket.close();

  // 8. /mcp.
  assert(
    (await getMcp(httpBase, adminToken)) === 405,
    "the administrator's token passes the /mcp gate",
  );
  const asUser = await postToMcp(httpBase, freshToken);
  assert(
    asUser.status === 403 &&
      (asUser.body.error as McpErrorBody).message === "admin_only",
    `a user token on /mcp (got ${asUser.status})`,
  );
  const roster = await loginForToken(httpBase);
  const asRoster = await postToMcp(httpBase, roster.token);
  assert(
    asRoster.status === 403 &&
      (asRoster.body.error as McpErrorBody).message === "admin_only",
    `a roster token on /mcp (got ${asRoster.status})`,
  );

  admin.socket.close();
  console.log(
    "  ✓ admin: list (isSelf) → approve → block closes the open socket with 4401 → unblock leaves the old token ended → self and non-admin refused → /mcp admits the administrator only",
  );

  return freshToken;
}

export async function runAccountsJourney(
  httpBase: string,
  wsBase: string,
): Promise<void> {
  const registeredEmail = await runRegistrationLeg(httpBase);
  await runOriginLeg(httpBase);
  await runSeededAccountsLeg(httpBase, wsBase, registeredEmail);
}
