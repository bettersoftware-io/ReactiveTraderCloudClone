import { catchError, defer, from, type Observable, of } from "rxjs";

import type { AuthOutcome, AuthPort } from "@rtc/domain";
import type { LoginResponseDto } from "@rtc/shared";

type FetchImpl = typeof fetch;

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
      return { ok: true, token: dto.token, user: dto.user };
    }

    if (response.status === 401) {
      return { ok: false, reason: "invalid" };
    }

    return { ok: false, reason: "unavailable" };
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
