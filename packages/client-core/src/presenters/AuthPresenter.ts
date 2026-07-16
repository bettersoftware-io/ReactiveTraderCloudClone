import { BehaviorSubject, type Observable } from "rxjs";
import { shareReplay } from "rxjs/operators";

import type { AuthOutcome, AuthPort, SessionUser } from "@rtc/domain";

import type { SessionStore, StoredSession } from "../adapters/sessionStore.js";

export type AuthStatus = "unauthenticated" | "authenticating" | "authenticated";

/** Auth view-model: sign-in status, the signed-in operator, and lock state. */
export interface AuthViewState {
  readonly status: AuthStatus;
  readonly user: SessionUser | null;
  readonly locked: boolean;
  readonly error: string | null;
}

/** How long a written session stays valid before {@link AuthPresenter} treats it as expired on resume. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const UNAUTHENTICATED_STATE: AuthViewState = {
  status: "unauthenticated",
  user: null,
  locked: false,
  error: null,
};

/**
 * App-layer presenter for the login/lock/logout lifecycle. Models the flow as
 * a `BehaviorSubject<AuthViewState>` machine: resumes a non-expired session
 * from the injected `SessionStore` on construction, drives `login`/`unlock`
 * through the injected `AuthPort`, and never logs the password.
 */
export class AuthPresenter {
  readonly state$: Observable<AuthViewState>;

  private readonly subject: BehaviorSubject<AuthViewState>;

  private currentUsername: string | null = null;

  constructor(
    private readonly auth: AuthPort,
    private readonly store: SessionStore,
    private readonly now: () => number = () => {
      return Date.now();
    },
  ) {
    this.subject = new BehaviorSubject<AuthViewState>(this.resume());
    this.state$ = this.subject.pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  /** Reads the store and either resumes a live session or clears a stale one. */
  private resume(): AuthViewState {
    const entry = this.store.read();

    if (entry && entry.exp > this.now()) {
      this.currentUsername = entry.username;
      return {
        status: "authenticated",
        user: entry.user,
        locked: false,
        error: null,
      };
    }

    this.store.clear();
    return UNAUTHENTICATED_STATE;
  }

  /** Begins a login attempt against the injected `AuthPort`. */
  login(username: string, password: string): void {
    this.subject.next({
      status: "authenticating",
      user: null,
      locked: false,
      error: null,
    });

    this.auth.login(username, password).subscribe((outcome) => {
      this.handleLoginOutcome(username, outcome);
    });
  }

  private handleLoginOutcome(username: string, outcome: AuthOutcome): void {
    if (outcome.ok) {
      this.currentUsername = username;
      this.writeSession(username, outcome.token, outcome.user);
      this.subject.next({
        status: "authenticated",
        user: outcome.user,
        locked: false,
        error: null,
      });
      return;
    }

    this.subject.next({
      status: "unauthenticated",
      user: null,
      locked: false,
      error: describeAuthFailure(outcome.reason),
    });
  }

  /** Locks the current session; a no-op unless a session is authenticated. */
  lock(): void {
    const current = this.subject.value;

    if (current.status !== "authenticated") {
      return;
    }

    this.subject.next({ ...current, locked: true });
  }

  /** Re-authenticates the current user to clear the lock; a no-op with no active session. */
  unlock(password: string): void {
    const username = this.currentUsername;

    if (username === null) {
      return;
    }

    this.auth.login(username, password).subscribe((outcome) => {
      this.handleUnlockOutcome(username, outcome);
    });
  }

  private handleUnlockOutcome(username: string, outcome: AuthOutcome): void {
    const current = this.subject.value;

    if (outcome.ok) {
      this.writeSession(username, outcome.token, outcome.user);
      this.subject.next({
        ...current,
        user: outcome.user,
        locked: false,
        error: null,
      });
      return;
    }

    this.subject.next({
      ...current,
      locked: true,
      error: "Invalid credentials",
    });
  }

  /** Clears the session and returns to the unauthenticated state. */
  logout(): void {
    this.store.clear();
    this.currentUsername = null;
    this.subject.next(UNAUTHENTICATED_STATE);
  }

  private writeSession(
    username: string,
    token: string,
    user: SessionUser,
  ): void {
    const session: StoredSession = {
      token,
      user,
      username,
      exp: this.now() + SESSION_TTL_MS,
    };
    this.store.write(session);
  }
}

function describeAuthFailure(reason: "invalid" | "unavailable"): string {
  return reason === "invalid" ? "Invalid credentials" : "Service unavailable";
}
