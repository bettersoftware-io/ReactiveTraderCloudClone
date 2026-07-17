import { type Observable, of } from "rxjs";

import { DEFAULT_AUTH_TTL_MS } from "../auth/authTtl.js";
import { findRosterUser } from "../auth/roster.js";
import type { AuthOutcome, AuthPort } from "../ports/authPort.js";

export interface DevCredentials {
  readonly [username: string]: string;
}

/**
 * In-process AuthPort for local simulator mode. Validates the public roster
 * against injected dev-only credentials (supplied by the client shell from a
 * gitignored .env). The token is cosmetic — simulator mode has no WS to gate —
 * but the flow is identical to the real HttpAuthAdapter.
 */
export class AuthSimulator implements AuthPort {
  constructor(
    private readonly devCredentials: DevCredentials,
    private readonly ttlMs: number = DEFAULT_AUTH_TTL_MS,
    private readonly now: () => number = (): number => {
      return Date.now();
    },
  ) {}

  login(username: string, password: string): Observable<AuthOutcome> {
    const entry = findRosterUser(username);
    const expected = this.devCredentials[username];

    if (!entry || expected === undefined || password !== expected) {
      return of({ ok: false, reason: "invalid" });
    }

    const token = `sim.${username}.${entry.user.id}`;
    return of({
      ok: true,
      token,
      user: entry.user,
      exp: this.now() + this.ttlMs,
    });
  }
}
