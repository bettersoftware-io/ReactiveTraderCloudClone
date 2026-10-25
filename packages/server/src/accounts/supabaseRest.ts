import { isIP } from "node:net";

export interface SupabaseRestOptions {
  /** The project URL, e.g. `https://abcd.supabase.co`. */
  readonly url: string;
  /** A SECRET API key (`sb_secret_…`). Server-side only; it bypasses RLS. */
  readonly secretKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

export type Reply =
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

export interface Call {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  /** Replaces the secret key as the bearer (a user's own session). */
  readonly bearer?: string;
  readonly callerIp?: string;
  readonly headers?: Record<string, string>;
}

const UNREACHABLE: Reply = { kind: "unreachable" };

export interface SupabaseRestClient {
  call(request: Call): Promise<Reply>;
}

/**
 * The plain-`fetch` transport to a Supabase project, shared by the account
 * directory and the spend store: the secret key as `apikey` and bearer, a
 * timeout on every call, and one rule for what counts as the project being
 * unreachable (network failure, any 5xx, the gateway's own 401/403).
 */
export function createSupabaseRestClient(
  options: SupabaseRestOptions,
): SupabaseRestClient {
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

  return { call };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function readField(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  return (value as Record<string, unknown>)[field];
}

export function readString(value: unknown, field: string): string | null {
  const found = readField(value, field);

  return typeof found === "string" ? found : null;
}

/** Supabase Auth answers `{error_code}` today; its token endpoint used to
 * answer OAuth-style `{error, error_description}`. Both are read. This relies
 * on Supabase's DEFAULT error shape: sending an `X-Supabase-Api-Version`
 * header would move the code elsewhere, and every refusal would then read
 * as `unknown` — that is, as unavailable. */
export function readErrorCode(body: unknown): string {
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
