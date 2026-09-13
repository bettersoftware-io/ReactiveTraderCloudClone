import type { LoginWaitVariant, SessionUser } from "@rtc/domain";

import type { Stream } from "#/stream";

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

/**
 * The login/lock/logout lifecycle: resumes a non-expired session from the
 * injected session store on construction, drives `login`/`unlock` through the
 * auth port, and never logs the password.
 */
export interface AuthPresenter {
  readonly state$: Stream<AuthViewState>;
  /** Begins a login attempt against the injected auth port. */
  login(username: string, password: string): void;
  /** Locks the current session; a no-op unless a session is authenticated. */
  lock(): void;
  /** Re-authenticates the current user to clear the lock; a no-op with no active session. */
  unlock(password: string): void;
  /** Clears the session and returns to the unauthenticated state. */
  logout(): void;
}
