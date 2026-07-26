import { BehaviorSubject, type Observable } from "rxjs";
import { shareReplay } from "rxjs/operators";

import {
  type AuthOutcome,
  type AuthPort,
  DEFAULT_LOGIN_WAIT_VARIANT,
  LOGIN_WAIT_VARIANTS,
  type LoginWaitVariant,
  type SessionUser,
} from "@rtc/domain";

import type { SessionStore, StoredSession } from "../adapters/sessionStore.js";

export type AuthStatus = "unauthenticated" | "authenticating" | "authenticated";

/** The persisted login-wait variant cycle. Shaped like `BootSequenceDeps` —
 * the presenter reads and advances, but never touches localStorage itself. */
export interface LoginWaitCycle {
  /** Current persisted cycle position → the variant for this attempt. */
  readonly current: () => LoginWaitVariant;
  /** Advance the persisted pointer (preferences seam; NO localStorage here). */
  readonly advance: (next: LoginWaitVariant) => void;
}

/** Auth view-model: sign-in status, the signed-in operator, and lock state. */
export interface AuthViewState {
  readonly status: AuthStatus;
  readonly user: SessionUser | null;
  readonly locked: boolean;
  /** True while an unlock (re-authenticate) request is in flight.
   *
   * Deliberately NOT modelled as `status: "authenticating"`. AuthGate renders
   * LoginScreen whenever `status !== "authenticated"`, so reusing the status
   * would unmount the entire app mid-unlock and flash the sign-in form —
   * taking the lock overlay down with it, since LockScreen lives inside App
   * rather than in the gate. */
  readonly unlocking: boolean;
  readonly error: string | null;
  /** The wait treatment to render for the current attempt. */
  readonly waitVariant: LoginWaitVariant;
}

const UNAUTHENTICATED_STATE: AuthViewState = {
  status: "unauthenticated",
  user: null,
  locked: false,
  unlocking: false,
  error: null,
  waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
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
    private readonly cycle: LoginWaitCycle = {
      current: (): LoginWaitVariant => {
        return DEFAULT_LOGIN_WAIT_VARIANT;
      },
      advance: (): void => {
        // no-op default: composition injects the real preferences-backed cycle
      },
    },
  ) {
    this.subject = new BehaviorSubject<AuthViewState>(this.resume());
    this.state$ = this.subject.pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  /** Reads the current variant and advances the persisted pointer immediately.
   * Advance-on-start mirrors createBootSequenceMachine (BootSequenceMachine.ts:44-45):
   * an attempt abandoned by a reload still flips the variant for next time. */
  private pickWaitVariant(): LoginWaitVariant {
    const variant = this.cycle.current();
    const nextIdx =
      (LOGIN_WAIT_VARIANTS.indexOf(variant) + 1) % LOGIN_WAIT_VARIANTS.length;
    this.cycle.advance(LOGIN_WAIT_VARIANTS[nextIdx]);
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
      });
      return;
    }

    this.subject.next({
      ...current,
      locked: true,
      unlocking: false,
      error: describeAuthFailure(outcome.reason),
    });
  }

  /** Clears the session and returns to the unauthenticated state. */
  logout(): void {
    this.store.clear();
    this.currentUsername = null;
    this.subject.next(UNAUTHENTICATED_STATE);
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

function describeAuthFailure(reason: "invalid" | "unavailable"): string {
  return reason === "invalid" ? "Invalid credentials" : "Service unavailable";
}
