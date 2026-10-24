import { catchError, defer, from, type Observable, of } from "rxjs";

import type { AccountFlowOutcome, AuthOutcome, AuthPort } from "@rtc/domain";
import {
  isAccountErrorDto,
  isAccountFlowResponseDto,
  type LoginResponseDto,
} from "@rtc/shared";

type FetchImpl = typeof fetch;

const FLOW_UNAVAILABLE: AccountFlowOutcome = {
  ok: false,
  reason: "unavailable",
};

interface MaybeAccess {
  readonly access?: unknown;
}

/**
 * AuthPort backed by the server's `POST /login` HTTP endpoint. Used in WS-real
 * mode; AuthSimulator (`@rtc/domain`) plays the same role in simulator mode.
 * Never logs the username, password, or request body.
 */
export class HttpAuthAdapter implements AuthPort {
  private readonly fetchImpl: FetchImpl;

  constructor(
    private readonly httpBaseUrl: string,
    fetchImpl?: FetchImpl,
  ) {
    this.fetchImpl = fetchImpl ?? this.defaultFetch;
  }

  private defaultFetch(...args: Parameters<FetchImpl>): ReturnType<FetchImpl> {
    return fetch(...args);
  }

  login(username: string, password: string): Observable<AuthOutcome> {
    return defer(() => {
      return from(this.postLogin(username, password));
    }).pipe(
      catchError(() => {
        return of<AuthOutcome>({ ok: false, reason: "unavailable" });
      }),
    );
  }

  register(email: string, displayName: string): Observable<AccountFlowOutcome> {
    return this.flow("/register", { email, displayName });
  }

  resendCode(email: string): Observable<AccountFlowOutcome> {
    return this.flow("/resend-code", { email });
  }

  confirmEmail(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome> {
    return this.flow("/confirm-email", { email, code, password });
  }

  requestPasswordReset(email: string): Observable<AccountFlowOutcome> {
    return this.flow("/request-reset", { email });
  }

  resetPassword(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome> {
    return this.flow("/reset-password", { email, code, password });
  }

  private flow(
    path: string,
    body: Record<string, string>,
  ): Observable<AccountFlowOutcome> {
    return defer(() => {
      return from(this.postFlow(path, body));
    }).pipe(
      catchError((): Observable<AccountFlowOutcome> => {
        return of(FLOW_UNAVAILABLE);
      }),
    );
  }

  private async postFlow(
    path: string,
    body: Record<string, string>,
  ): Promise<AccountFlowOutcome> {
    const response = await this.fetchImpl(`${this.httpBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);

    if (response.status === 200 || response.status === 202) {
      return isAccountFlowResponseDto(payload)
        ? { ok: true, status: payload.status }
        : FLOW_UNAVAILABLE;
    }

    if (response.status === 429) {
      return { ok: false, reason: "rate_limited" };
    }

    const error = readErrorWord(payload);

    if (response.status === 400 && error === "invalid_code") {
      return { ok: false, reason: "invalid_code" };
    }

    if (response.status === 400 && error === "invalid_request") {
      return isAccountErrorDto(payload) && payload.rule !== undefined
        ? { ok: false, reason: "invalid_input", rule: payload.rule }
        : { ok: false, reason: "invalid_input" };
    }

    if (response.status === 403 && error === "registration_closed") {
      return { ok: false, reason: "registration_closed" };
    }

    return FLOW_UNAVAILABLE;
  }

  private async postLogin(
    username: string,
    password: string,
  ): Promise<AuthOutcome> {
    const response = await this.fetchImpl(`${this.httpBaseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (response.status === 200) {
      const dto: LoginResponseDto = await response.json();
      // Pass `access` through; a server that omits it names an ordinary user.
      const access = (dto.user as MaybeAccess).access;

      return {
        ok: true,
        token: dto.token,
        user: { ...dto.user, access: access === "admin" ? "admin" : "user" },
        exp: dto.exp,
      };
    }

    if (response.status === 401) {
      return { ok: false, reason: "invalid" };
    }

    if (response.status === 403) {
      const payload = await readJson(response);
      const error = readErrorWord(payload);

      if (error === "unconfirmed") {
        return { ok: false, reason: "unconfirmed" };
      }

      if (error === "pending_approval") {
        return { ok: false, reason: "pending" };
      }

      if (error === "blocked") {
        return { ok: false, reason: "blocked" };
      }
    }

    return { ok: false, reason: "unavailable" };
  }
}

/** A failure body's `error` word, read apart from its `rule`: a rule this
 * client does not know (which fails `isAccountErrorDto`) costs the rule, not
 * the refusal. */
function readErrorWord(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const error = (payload as Record<string, unknown>).error;

  return typeof error === "string" ? error : null;
}

/** The body as JSON, or null when it is not JSON — a refusal from a proxy
 * or the origin policy may carry none. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Derives the server's HTTP base URL from its WebSocket URL by swapping only
 * the scheme (`ws://` -> `http://`, `wss://` -> `https://`); everything after
 * the scheme is left unchanged.
 */
export function wsUrlToHttpBase(wsUrl: string): string {
  if (wsUrl.startsWith("wss://")) {
    return `https://${wsUrl.slice("wss://".length)}`;
  }

  if (wsUrl.startsWith("ws://")) {
    return `http://${wsUrl.slice("ws://".length)}`;
  }

  return wsUrl;
}
