import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

import {
  type AccountDirectory,
  type AccountLookup,
  type AccountRecord,
  type ConfirmOutcome,
  deriveAccountStatus,
  type PasswordCheck,
  type PurgeOutcome,
  type RegistrationCount,
  type ResetOutcome,
  type SendOutcome,
  type SignUpInput,
  type SignUpOutcome,
} from "./AccountDirectory.js";

export interface SupabaseDirectoryOptions {
  /** The project URL, e.g. `https://abcd.supabase.co`. */
  readonly url: string;
  /** A SECRET API key (`sb_secret_…`). Server-side only; it bypasses RLS. */
  readonly secretKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

/** Supabase's OTP type for the sign-up confirmation code — and ONLY that
 * code. Type "email" would also accept a recovery code, turning
 * confirmation into a second password-reset path for a confirmed account. */
const SIGNUP_OTP_TYPE = "signup";
const RECOVERY_OTP_TYPE = "recovery";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_RANGE_TOTAL = /\/(\d+)$/;
const PROFILE_COLUMNS =
  "id,email,display_name,role,approved,blocked,email_confirmed_at";

type Reply =
  | {
      readonly kind: "ok";
      readonly body: unknown;
      readonly contentRange: string | null;
    }
  | {
      readonly kind: "refused";
      readonly status: number;
      readonly errorCode: string;
    }
  | { readonly kind: "unreachable" };

interface Call {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  /** Replaces the secret key as the bearer (a user's own session). */
  readonly bearer?: string;
  readonly callerIp?: string;
  readonly headers?: Record<string, string>;
}

const UNREACHABLE: Reply = { kind: "unreachable" };

/** What became of "verify the emailed code, then set the password with the
 * session that verification returned" — shared by confirmation and reset. */
type CodeAndPassword =
  | { readonly step: "code-unreachable" }
  | { readonly step: "code-refused" }
  | { readonly step: "no-session" }
  | { readonly step: "password-answered"; readonly reply: Reply };

/**
 * The account directory over Supabase's REST endpoints — Auth for
 * credentials and codes, PostgREST for the `profiles` table — with plain
 * `fetch`. Supabase's own session tokens are used inside one call and then
 * logged out; nothing here is ever sent to a browser. A timeout, a network
 * failure or any 5xx (540 is a paused project) is `unavailable`.
 */
export function createSupabaseAccountDirectory(
  options: SupabaseDirectoryOptions,
): AccountDirectory {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.url.replace(/\/+$/, "");

  async function call(request: Call): Promise<Reply> {
    const headers: Record<string, string> = {
      apikey: options.secretKey,
      Authorization: `Bearer ${request.bearer ?? options.secretKey}`,
      ...request.headers,
    };

    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (request.callerIp !== undefined && isIP(request.callerIp) !== 0) {
      headers["Sb-Forwarded-For"] = request.callerIp;
    }

    let response: Response;

    try {
      response = await fetchImpl(`${base}${request.path}`, {
        method: request.method,
        headers,
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      return UNREACHABLE;
    }

    if (response.status >= 500) {
      return UNREACHABLE;
    }

    const body = await readJson(response);

    // A 401 is the gateway refusing OUR key (rotated, revoked, mistyped); a
    // 403 with no `error_code` is the gateway too (GoTrue's own refusals,
    // `otp_expired` among them, carry one). Neither says anything about the
    // user, so neither may read as a wrong password or a bad code.
    if (
      response.status === 401 ||
      (response.status === 403 && readString(body, "error_code") === null)
    ) {
      return UNREACHABLE;
    }

    if (response.ok) {
      return {
        kind: "ok",
        body,
        contentRange: response.headers.get("content-range"),
      };
    }

    return {
      kind: "refused",
      status: response.status,
      errorCode: readErrorCode(body),
    };
  }

  /**
   * Ends a Supabase session the server opened (a password grant or a
   * verified code), so a confirmed account cannot grow Supabase's session
   * and refresh-token tables at the sign-in rate. Bounded by the same
   * timeout; its outcome is ignored and it never throws — a failed logout
   * never changes the answer.
   */
  async function closeSession(accessToken: string): Promise<void> {
    try {
      await call({
        method: "POST",
        path: "/auth/v1/logout?scope=local",
        bearer: accessToken,
      });
    } catch {
      // Ignored by design: see above.
    }
  }

  /**
   * Verifies an emailed code; on success Supabase answers with that user's
   * session, which then sets the password (`PUT /auth/v1/user`). The session
   * is used for this one call and logged out. A 429 on the verify is
   * Supabase throttling us, not a verdict on the code, so it reads as
   * unreachable (never a wrong code, which would strike the caller).
   */
  async function setPasswordWithCode(
    type: string,
    email: string,
    token: string,
    password: string,
    callerIp: string,
  ): Promise<CodeAndPassword> {
    const verified = await call({
      method: "POST",
      path: "/auth/v1/verify",
      body: { type, email, token },
      callerIp,
    });

    if (
      verified.kind === "unreachable" ||
      (verified.kind === "refused" && verified.status === 429)
    ) {
      return { step: "code-unreachable" };
    }

    if (verified.kind === "refused") {
      return { step: "code-refused" };
    }

    const session = readString(verified.body, "access_token");

    if (session === null) {
      return { step: "no-session" };
    }

    const reply = await call({
      method: "PUT",
      path: "/auth/v1/user",
      body: { password },
      bearer: session,
      callerIp,
    });

    await closeSession(session);

    return { step: "password-answered", reply };
  }

  return {
    kind: "supabase",

    async signUp(input: SignUpInput, callerIp: string): Promise<SignUpOutcome> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/signup",
        body: {
          email: input.email,
          password: createUnknowablePassword(),
          data: { display_name: input.displayName },
        },
        callerIp,
      });

      if (reply.kind === "ok") {
        return "sent";
      }

      if (reply.kind === "unreachable") {
        return "unavailable";
      }

      if (reply.errorCode === "email_address_invalid") {
        return "rejected-email";
      }

      // `over_email_send_rate_limit` comes back in two cases: Supabase's
      // per-address resend limit for an address that already has a user
      // record, and the project-wide email allowance being spent. The two
      // are indistinguishable, and answering anything but `sent` to the
      // first would reveal a registration, so both read as `sent`. The
      // server's own hourly send fuse (`EMAIL_SENDS_PER_HOUR_MAX`, set below
      // the project's limit) is what keeps the second from being silent.
      // `weak_password` is about OUR random password — a store whose policy
      // refuses it is misconfigured — so it falls through to `unavailable`.
      return reply.errorCode === "user_already_exists" ||
        reply.errorCode === "email_exists" ||
        reply.errorCode === "over_email_send_rate_limit"
        ? "sent"
        : "unavailable";
    },

    async resendCode(email: string, callerIp: string): Promise<SendOutcome> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/resend",
        body: { type: "signup", email },
        callerIp,
      });

      return sendOutcomeOf(reply);
    },

    async confirmEmail(
      email: string,
      code: string,
      password: string,
      callerIp: string,
    ): Promise<ConfirmOutcome> {
      const result = await setPasswordWithCode(
        SIGNUP_OTP_TYPE,
        email,
        code,
        password,
        callerIp,
      );

      if (result.step === "code-unreachable") {
        return "unavailable";
      }

      if (result.step === "code-refused") {
        return "invalid_code";
      }

      // From here the code is spent and the email confirmed; only the
      // password can still be missing.
      if (result.step === "no-session") {
        return "confirmed_unset";
      }

      const { reply } = result;

      return reply.kind === "ok" ||
        (reply.kind === "refused" && reply.errorCode === "same_password")
        ? "confirmed"
        : "confirmed_unset";
    },

    async checkPassword(
      email: string,
      password: string,
      callerIp: string,
    ): Promise<PasswordCheck> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/token?grant_type=password",
        body: { email, password },
        callerIp,
      });

      if (reply.kind === "unreachable") {
        return { outcome: "unavailable" };
      }

      if (reply.kind === "refused") {
        if (reply.errorCode === "email_not_confirmed") {
          return { outcome: "unconfirmed" };
        }

        return { outcome: reply.status === 429 ? "unavailable" : "invalid" };
      }

      const accessToken = readString(reply.body, "access_token");

      if (accessToken !== null) {
        await closeSession(accessToken);
      }

      const accountId = readString(readField(reply.body, "user"), "id");

      return accountId === null
        ? { outcome: "unavailable" }
        : { outcome: "match", accountId };
    },

    async requestReset(email: string, callerIp: string): Promise<SendOutcome> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/recover",
        body: { email },
        callerIp,
      });

      return sendOutcomeOf(reply);
    },

    async resetPassword(
      email: string,
      code: string,
      password: string,
      callerIp: string,
    ): Promise<ResetOutcome> {
      const result = await setPasswordWithCode(
        RECOVERY_OTP_TYPE,
        email,
        code,
        password,
        callerIp,
      );

      if (result.step === "code-refused") {
        return "invalid_code";
      }

      if (result.step !== "password-answered") {
        return "unavailable";
      }

      const { reply } = result;

      // A throttled update says nothing about the password, so it is not
      // `rejected` (which tells the user to choose another).
      if (
        reply.kind === "unreachable" ||
        (reply.kind === "refused" && reply.status === 429)
      ) {
        return "unavailable";
      }

      // The code is spent either way; `same_password` means the password
      // already is what the user asked for.
      return reply.kind === "ok" || reply.errorCode === "same_password"
        ? "changed"
        : "rejected";
    },

    async findAccount(accountId: string): Promise<AccountLookup> {
      // The id comes from a token claim and goes into a query string.
      if (!UUID_SHAPE.test(accountId)) {
        return { outcome: "missing" };
      }

      const reply = await call({
        method: "GET",
        path: `/rest/v1/profiles?id=eq.${accountId}&select=${PROFILE_COLUMNS}`,
      });

      return lookupOf(reply);
    },

    async findByEmail(email: string): Promise<AccountLookup> {
      // At the top level PostgREST parses the operator first and takes the
      // rest of the parameter as the value, so a local part's `+`, `.` or `,`
      // needs no quoting — and must not be quoted: only logic trees and
      // `in.(…)` lists strip double quotes, so a quoted value here would be
      // compared with its quotes and match nothing. Percent-encoding is the
      // only transformation; the validator bounds the character set.
      const reply = await call({
        method: "GET",
        path: `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=${PROFILE_COLUMNS}`,
      });

      return lookupOf(reply);
    },

    async purgeUnconfirmedBefore(
      cutoffMs: number,
      limit: number,
    ): Promise<PurgeOutcome> {
      if (
        !Number.isFinite(cutoffMs) ||
        !Number.isInteger(limit) ||
        limit <= 0
      ) {
        return { outcome: "unavailable" };
      }

      const cutoff = encodeURIComponent(new Date(cutoffMs).toISOString());
      const listed = await call({
        method: "GET",
        path: `/rest/v1/profiles?select=id&email_confirmed_at=is.null&created_at=lt.${cutoff}&order=created_at.asc&limit=${limit}`,
      });

      if (listed.kind !== "ok" || !Array.isArray(listed.body)) {
        return { outcome: "unavailable" };
      }

      let count = 0;

      for (const row of listed.body) {
        const id = readString(row, "id");

        if (id === null || !UUID_SHAPE.test(id)) {
          continue;
        }

        // The cascade removes the profile; a 404 is an account already gone.
        const deleted = await call({
          method: "DELETE",
          path: `/auth/v1/admin/users/${id}`,
        });

        if (
          deleted.kind === "ok" ||
          (deleted.kind === "refused" && deleted.status === 404)
        ) {
          count += 1;
        } else {
          break;
        }
      }

      return { outcome: "purged", count };
    },

    async countRegistrationsSince(sinceMs: number): Promise<RegistrationCount> {
      if (!Number.isFinite(sinceMs)) {
        return { outcome: "unavailable" };
      }

      const since = encodeURIComponent(new Date(sinceMs).toISOString());
      const reply = await call({
        method: "GET",
        path: `/rest/v1/profiles?select=id&created_at=gte.${since}`,
        headers: { Prefer: "count=exact", Range: "0-0" },
      });

      if (reply.kind !== "ok" || reply.contentRange === null) {
        return { outcome: "unavailable" };
      }

      const total = CONTENT_RANGE_TOTAL.exec(reply.contentRange)?.[1];

      return total === undefined
        ? { outcome: "unavailable" }
        : { outcome: "counted", count: Number(total) };
    },

    async ping(): Promise<boolean> {
      const reply = await call({
        method: "GET",
        path: "/rest/v1/profiles?select=id&limit=1",
      });

      return reply.kind === "ok";
    },
  };
}

/**
 * The password a sign-up stores until the confirmation sets the real one:
 * 32 random bytes nobody ever sees (never logged, never returned), behind a
 * prefix that satisfies any character-class policy. 47 bytes, under bcrypt's
 * 72.
 */
function createUnknowablePassword(): string {
  return `Aa1!${randomBytes(32).toString("base64url")}`;
}

/** A code was sent, as far as the caller may know. A REFUSAL (a per-address
 * rate limit, say) must read the same as success, or it would reveal that
 * the address has an account. Only an unreachable store is `unavailable`. */
function sendOutcomeOf(reply: Reply): SendOutcome {
  return reply.kind === "unreachable" ? "unavailable" : "sent";
}

/** A profile read as a lookup: the first row, mapped. */
function lookupOf(reply: Reply): AccountLookup {
  if (reply.kind !== "ok" || !Array.isArray(reply.body)) {
    return { outcome: "unavailable" };
  }

  if (reply.body.length === 0) {
    return { outcome: "missing" };
  }

  const account = toAccountRecord(reply.body[0]);

  return account === null
    ? { outcome: "unavailable" }
    : { outcome: "found", account };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readField(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  return (value as Record<string, unknown>)[field];
}

function readString(value: unknown, field: string): string | null {
  const found = readField(value, field);

  return typeof found === "string" ? found : null;
}

/** Supabase Auth answers `{error_code}` today; its token endpoint used to
 * answer OAuth-style `{error, error_description}`. Both are read. This relies
 * on Supabase's DEFAULT error shape: sending an `X-Supabase-Api-Version`
 * header would move the code elsewhere, and every refusal would then read
 * as `unknown` — that is, as unavailable. */
function readErrorCode(body: unknown): string {
  const code = readString(body, "error_code");

  if (code !== null) {
    return code;
  }

  if (readString(body, "error") !== "invalid_grant") {
    return "unknown";
  }

  const description = readString(body, "error_description") ?? "";

  return description.toLowerCase().includes("not confirmed")
    ? "email_not_confirmed"
    : "invalid_credentials";
}

function toAccountRecord(row: unknown): AccountRecord | null {
  const id = readString(row, "id");
  const email = readString(row, "email");
  const displayName = readString(row, "display_name");
  const role = readField(row, "role");
  const approved = readField(row, "approved");
  const blocked = readField(row, "blocked");

  if (
    id === null ||
    email === null ||
    displayName === null ||
    (role !== "user" && role !== "admin") ||
    typeof approved !== "boolean" ||
    typeof blocked !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    email,
    displayName,
    access: role,
    status: deriveAccountStatus({
      confirmed: readString(row, "email_confirmed_at") !== null,
      approved,
      blocked,
    }),
  };
}
