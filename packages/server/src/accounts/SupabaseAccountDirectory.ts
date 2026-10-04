import { isIP } from "node:net";

import {
  type AccountDirectory,
  type AccountLookup,
  type AccountRecord,
  type ConfirmOutcome,
  deriveAccountStatus,
  type PasswordCheck,
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

/** Supabase's OTP type for an emailed sign-up confirmation code. */
const CONFIRM_OTP_TYPE = "email";
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
  readonly method: "GET" | "POST" | "PUT";
  readonly path: string;
  readonly body?: unknown;
  /** Replaces the secret key as the bearer (a user's own session). */
  readonly bearer?: string;
  readonly callerIp?: string;
  readonly headers?: Record<string, string>;
}

const UNREACHABLE: Reply = { kind: "unreachable" };

/**
 * The account directory over Supabase's REST endpoints — Auth for
 * credentials and codes, PostgREST for the `profiles` table — with plain
 * `fetch`. Supabase's own session tokens are used inside one call and
 * dropped; nothing here is ever sent to a browser. A timeout, a network
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

  /** Verifies an emailed code; on success Supabase answers with a session. */
  function verifyCode(
    type: string,
    email: string,
    token: string,
    callerIp: string,
  ): Promise<Reply> {
    return call({
      method: "POST",
      path: "/auth/v1/verify",
      body: { type, email, token },
      callerIp,
    });
  }

  return {
    kind: "supabase",

    async signUp(input: SignUpInput, callerIp: string): Promise<SignUpOutcome> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/signup",
        body: {
          email: input.email,
          password: input.password,
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

      if (reply.errorCode === "weak_password") {
        return "rejected-password";
      }

      if (reply.errorCode === "email_address_invalid") {
        return "rejected-email";
      }

      // `over_email_send_rate_limit` fires only for an address that already
      // has a user record, so it must read as `sent`, like an existing one.
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
      callerIp: string,
    ): Promise<ConfirmOutcome> {
      const reply = await verifyCode(CONFIRM_OTP_TYPE, email, code, callerIp);

      if (reply.kind === "unreachable") {
        return "unavailable";
      }

      return reply.kind === "ok" ? "confirmed" : "invalid_code";
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
      const verified = await verifyCode(
        RECOVERY_OTP_TYPE,
        email,
        code,
        callerIp,
      );

      if (verified.kind === "unreachable") {
        return "unavailable";
      }

      if (verified.kind === "refused") {
        return "invalid_code";
      }

      const session = readString(verified.body, "access_token");

      if (session === null) {
        return "unavailable";
      }

      const updated = await call({
        method: "PUT",
        path: "/auth/v1/user",
        body: { password },
        bearer: session,
        callerIp,
      });

      if (updated.kind === "unreachable") {
        return "unavailable";
      }

      return updated.kind === "ok" ? "changed" : "rejected";
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

/** A code was sent, as far as the caller may know. A REFUSAL (a per-address
 * rate limit, say) must read the same as success, or it would reveal that
 * the address has an account. Only an unreachable store is `unavailable`. */
function sendOutcomeOf(reply: Reply): SendOutcome {
  return reply.kind === "unreachable" ? "unavailable" : "sent";
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
 * answer OAuth-style `{error, error_description}`. Both are read. */
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
