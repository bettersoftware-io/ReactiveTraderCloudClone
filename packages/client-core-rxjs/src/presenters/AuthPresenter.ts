import { type StateObservable, state } from "@rx-state/core";
import { BehaviorSubject } from "rxjs";

import type {
  AuthPresenter as AuthPresenterApi,
  AuthViewState,
  LoginWaitCycle,
  SessionStore,
  StoredSession,
} from "@rtc/core-api";
import { describeAuthFailure, nextLoginWaitVariant } from "@rtc/core-logic";
import {
  type AccountFlowPort,
  type AuthOutcome,
  type AuthPort,
  DEFAULT_LOGIN_WAIT_VARIANT,
  type LoginWaitVariant,
  type SessionUser,
} from "@rtc/domain";

const UNAUTHENTICATED_STATE: AuthViewState = {
  status: "unauthenticated",
  user: null,
  locked: false,
  unlocking: false,
  error: null,
  failure: null,
  waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
};

/** Implements `AuthPresenter` (`@rtc/core-api`) — see the interface for the
 * contract. Models the flow as a `BehaviorSubject<AuthViewState>` machine. */
export class AuthPresenter implements AuthPresenterApi {
  readonly state$: StateObservable<AuthViewState>;

  readonly accounts: AccountFlowPort;

  private readonly subject: BehaviorSubject<AuthViewState>;

  private currentUsername: string | null = null;

  constructor(
    private readonly auth: AuthPort,
    private readonly store: SessionStore,
    private readonly now: () => number = () => {
      return Date.now();
    },
    private readonly cycle: LoginWaitCycle = {
      current: (): LoginWaitVariant => {
        return DEFAULT_LOGIN_WAIT_VARIANT;
      },
      advance: (): void => {
        // no-op default: composition injects the real preferences-backed cycle
      },
    },
  ) {
    this.accounts = auth;
    const initial = this.resume();
    this.subject = new BehaviorSubject<AuthViewState>(initial);
    this.state$ = state(this.subject, initial);
  }

  /** Reads the current variant and advances the persisted pointer immediately.
   * Advance-on-start mirrors createBootSequenceMachine (BootSequenceMachine.ts:44-45):
   * an attempt abandoned by a reload still flips the variant for next time. */
  private pickWaitVariant(): LoginWaitVariant {
    const variant = this.cycle.current();
    this.cycle.advance(nextLoginWaitVariant(variant));
    return variant;
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
        unlocking: false,
        error: null,
        failure: null,
        waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
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
      unlocking: false,
      error: null,
      failure: null,
      waitVariant: this.pickWaitVariant(),
    });

    this.auth.login(username, password).subscribe((outcome) => {
      this.commitLoginOutcome(username, outcome);
    });
  }

  private commitLoginOutcome(username: string, outcome: AuthOutcome): void {
    if (outcome.ok) {
      this.currentUsername = username;
      this.writeSession(username, outcome.token, outcome.user, outcome.exp);
      this.subject.next({
        status: "authenticated",
        user: outcome.user,
        locked: false,
        unlocking: false,
        error: null,
        failure: null,
        waitVariant: this.subject.value.waitVariant,
      });
      return;
    }

    this.subject.next({
      status: "unauthenticated",
      user: null,
      locked: false,
      unlocking: false,
      error: describeAuthFailure(outcome.reason),
      failure: outcome.reason,
      waitVariant: this.subject.value.waitVariant,
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

    this.subject.next({
      ...this.subject.value,
      unlocking: true,
      error: null,
      failure: null,
      waitVariant: this.pickWaitVariant(),
    });

    this.auth.login(username, password).subscribe((outcome) => {
      this.commitUnlockOutcome(username, outcome);
    });
  }

  private commitUnlockOutcome(username: string, outcome: AuthOutcome): void {
    const current = this.subject.value;

    if (outcome.ok) {
      this.writeSession(username, outcome.token, outcome.user, outcome.exp);
      this.subject.next({
        ...current,
        user: outcome.user,
        locked: false,
        unlocking: false,
        error: null,
        failure: null,
      });
      return;
    }

    this.subject.next({
      ...current,
      locked: true,
      unlocking: false,
      error: describeAuthFailure(outcome.reason),
      failure: outcome.reason,
    });
  }

  /** Clears the session and returns to the unauthenticated state. */
  logout(): void {
    this.store.clear();
    this.currentUsername = null;
    this.subject.next(UNAUTHENTICATED_STATE);
  }

  /** The server ended this session (the transport's `sessionEnded()`):
   * clears the store and signs out with the reason and its copy. Not on the
   * `AuthPresenter` interface — composition routes the event here. A no-op
   * when nobody is authenticated, so a late event never overwrites a
   * sign-in failure's message. */
  endSession(): void {
    if (this.subject.value.status !== "authenticated") {
      return;
    }

    this.store.clear();
    this.currentUsername = null;
    this.subject.next({
      ...UNAUTHENTICATED_STATE,
      error: describeAuthFailure("session_ended"),
      failure: "session_ended",
    });
  }

  // `exp` is the expiry the AuthPort reported (the server's real token expiry
  // over HTTP, or the simulator's `now() + ttlMs`), persisted verbatim rather
  // than recomputed from a local TTL — so `resume()`'s `exp > now()` check
  // tracks the token's actual lifetime instead of drifting from it. The signed
  // token remains the real gate at the WS upgrade; this only decides when to
  // stop offering a stored session client-side.
  private writeSession(
    username: string,
    token: string,
    user: SessionUser,
    exp: number,
  ): void {
    const session: StoredSession = { token, user, username, exp };
    this.store.write(session);
  }
}
