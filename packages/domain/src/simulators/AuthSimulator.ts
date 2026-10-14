import { type Observable, of } from "rxjs";

import { DEFAULT_AUTH_TTL_MS } from "../auth/authTtl.js";
import { findRosterUser } from "../auth/roster.js";
import type {
  AccountFlowOutcome,
  AccountFlowPort,
  AuthOutcome,
  AuthPort,
} from "../ports/authPort.js";

export interface DevCredentials {
  readonly [username: string]: string;
}

const ACCOUNT_FLOWS_UNAVAILABLE: AccountFlowOutcome = {
  ok: false,
  reason: "unavailable",
};

/** The account flows of a port with no account store behind it: every call
 * answers `unavailable`, synchronously. The simulator's own, and the one
 * every test fake that only cares about `login` spreads in. */
export function createUnavailableAccountFlows(): AccountFlowPort {
  function unavailable(): Observable<AccountFlowOutcome> {
    return of(ACCOUNT_FLOWS_UNAVAILABLE);
  }

  return {
    register: unavailable,
    resendCode: unavailable,
    confirmEmail: unavailable,
    requestPasswordReset: unavailable,
    resetPassword: unavailable,
  };
}

/**
 * In-process AuthPort for local simulator mode. Validates the public roster
 * against injected dev-only credentials (supplied by the client shell from a
 * gitignored .env). The token is cosmetic — simulator mode has no WS to gate —
 * but the flow is identical to the real HttpAuthAdapter.
 */
export class AuthSimulator implements AuthPort {
  private readonly flows = createUnavailableAccountFlows();

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

  register(email: string, displayName: string): Observable<AccountFlowOutcome> {
    return this.flows.register(email, displayName);
  }

  resendCode(email: string): Observable<AccountFlowOutcome> {
    return this.flows.resendCode(email);
  }

  confirmEmail(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome> {
    return this.flows.confirmEmail(email, code, password);
  }

  requestPasswordReset(email: string): Observable<AccountFlowOutcome> {
    return this.flows.requestPasswordReset(email);
  }

  resetPassword(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome> {
    return this.flows.resetPassword(email, code, password);
  }
}
