import { type Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AuthOutcome, AuthPort, SessionUser } from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { StoredSession } from "#/adapters/sessionStore";

import { AuthPresenter, type AuthViewState } from "../AuthPresenter";

const USER: SessionUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};

describe("AuthPresenter", () => {
  it("resumes a non-expired session as authenticated", () => {
    function now(): number {
      return 1_000_000;
    }

    const store = new InMemorySessionStore();
    const session: StoredSession = {
      token: "tok-1",
      user: USER,
      username: "astark",
      exp: now() + 1000,
    };
    store.write(session);

    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: true, token: "tok-1", user: USER, exp: 9_000_000 }),
      store,
      now,
    );

    expect(latest(presenter)).toEqual({
      status: "authenticated",
      user: USER,
      locked: false,
      unlocking: false,
      error: null,
    });
  });

  it("clears an expired session on resume and starts unauthenticated", () => {
    function now(): number {
      return 1_000_000;
    }

    const store = new InMemorySessionStore();
    const session: StoredSession = {
      token: "tok-1",
      user: USER,
      username: "astark",
      exp: now() - 1,
    };
    store.write(session);

    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: false, reason: "invalid" }),
      store,
      now,
    );

    expect(latest(presenter)).toEqual({
      status: "unauthenticated",
      user: null,
      locked: false,
      unlocking: false,
      error: null,
    });
    expect(store.read()).toBeNull();
  });

  it("starts unauthenticated with an empty store", () => {
    const store = new InMemorySessionStore();
    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: false, reason: "invalid" }),
      store,
    );

    expect(latest(presenter)).toEqual({
      status: "unauthenticated",
      user: null,
      locked: false,
      unlocking: false,
      error: null,
    });
  });

  it("login success transitions authenticating -> authenticated and writes the session", () => {
    function now(): number {
      return 2_000_000;
    }

    const store = new InMemorySessionStore();
    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: true, token: "tok-2", user: USER, exp: 9_000_000 }),
      store,
      now,
    );

    const seen: AuthStatusSnapshot[] = [];
    const sub = presenter.state$.subscribe((s) => {
      seen.push({ status: s.status, user: s.user });
    });

    presenter.login("astark", "correct-horse");
    sub.unsubscribe();

    expect(seen).toEqual([
      { status: "unauthenticated", user: null },
      { status: "authenticating", user: null },
      { status: "authenticated", user: USER },
    ]);

    const stored = store.read();
    expect(stored).toEqual<StoredSession>({
      token: "tok-2",
      user: USER,
      username: "astark",
      exp: 9_000_000,
    });
  });

  it("login failure (invalid) sets an error and stays unauthenticated", () => {
    const store = new InMemorySessionStore();
    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: false, reason: "invalid" }),
      store,
    );

    presenter.login("astark", "wrong-password");

    expect(latest(presenter)).toEqual({
      status: "unauthenticated",
      user: null,
      locked: false,
      unlocking: false,
      error: "Invalid credentials",
    });
    expect(store.read()).toBeNull();
  });

  it("login failure (unavailable) reports a service-unavailable error", () => {
    const store = new InMemorySessionStore();
    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: false, reason: "unavailable" }),
      store,
    );

    presenter.login("astark", "correct-horse");

    expect(latest(presenter).error).toBe("Service unavailable");
  });

  it("lock() keeps status authenticated but sets locked", () => {
    function now(): number {
      return 3_000_000;
    }

    const store = new InMemorySessionStore();
    store.write({
      token: "tok-3",
      user: USER,
      username: "astark",
      exp: now() + 1000,
    });
    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: true, token: "tok-3", user: USER, exp: 9_000_000 }),
      store,
      now,
    );

    presenter.lock();

    expect(latest(presenter)).toEqual({
      status: "authenticated",
      user: USER,
      locked: true,
      unlocking: false,
      error: null,
    });
  });

  it("unlock() with the correct password clears the lock, refreshes the stored session, and calls the port with the remembered username", () => {
    let currentNow = 4_000_000;

    function now(): number {
      return currentNow;
    }

    const store = new InMemorySessionStore();
    store.write({
      token: "tok-4",
      user: USER,
      username: "astark",
      exp: currentNow + 1000,
    });
    const auth = fakeAuthPort({
      ok: true,
      token: "tok-4",
      user: USER,
      exp: 9_500_000,
    });
    const presenter = new AuthPresenter(auth, store, now);

    presenter.lock();
    currentNow += 60_000;
    presenter.unlock("correct-horse");

    expect(latest(presenter)).toEqual({
      status: "authenticated",
      user: USER,
      locked: false,
      unlocking: false,
      error: null,
    });

    expect(auth.calls.at(-1)).toEqual(["astark", "correct-horse"]);

    expect(store.read()).toEqual<StoredSession>({
      token: "tok-4",
      user: USER,
      username: "astark",
      exp: 9_500_000,
    });
  });

  it("unlock() with the wrong password stays locked, sets an error, and calls the port with the remembered username", () => {
    function now(): number {
      return 5_000_000;
    }

    const store = new InMemorySessionStore();
    store.write({
      token: "tok-5",
      user: USER,
      username: "astark",
      exp: now() + 1000,
    });
    const auth = fakeAuthPort({ ok: false, reason: "invalid" });
    const presenter = new AuthPresenter(auth, store, now);

    presenter.lock();
    presenter.unlock("wrong-password");

    expect(latest(presenter)).toEqual({
      status: "authenticated",
      user: USER,
      locked: true,
      unlocking: false,
      error: "Invalid credentials",
    });

    expect(auth.calls.at(-1)).toEqual(["astark", "wrong-password"]);
  });

  it("unlock() with an unavailable auth service stays locked and reports service unavailability", () => {
    function now(): number {
      return 5_500_000;
    }

    const store = new InMemorySessionStore();
    store.write({
      token: "tok-5b",
      user: USER,
      username: "astark",
      exp: now() + 1000,
    });
    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: false, reason: "unavailable" }),
      store,
      now,
    );

    presenter.lock();
    presenter.unlock("whatever-password");

    expect(latest(presenter)).toEqual({
      status: "authenticated",
      user: USER,
      locked: true,
      unlocking: false,
      error: "Service unavailable",
    });
  });

  it("logout() clears the store and returns to unauthenticated", () => {
    function now(): number {
      return 6_000_000;
    }

    const store = new InMemorySessionStore();
    store.write({
      token: "tok-6",
      user: USER,
      username: "astark",
      exp: now() + 1000,
    });
    const presenter = new AuthPresenter(
      fakeAuthPort({ ok: true, token: "tok-6", user: USER, exp: 9_000_000 }),
      store,
      now,
    );

    presenter.logout();

    expect(latest(presenter)).toEqual({
      status: "unauthenticated",
      user: null,
      locked: false,
      unlocking: false,
      error: null,
    });
    expect(store.read()).toBeNull();
  });

  it("unlock sets unlocking while in flight and leaves status authenticated", () => {
    const { presenter, resolve } = lockedPresenter();

    presenter.unlock("mcdc2026");

    const inFlight = latest(presenter);
    expect(inFlight.unlocking).toBe(true);
    // The whole app unmounts if status leaves "authenticated" — AuthGate
    // renders LoginScreen for any non-authenticated status.
    expect(inFlight.status).toBe("authenticated");
    expect(inFlight.locked).toBe(true);

    resolve({ ok: true, token: "t2", user: USER, exp: 9e12 });
    expect(latest(presenter).unlocking).toBe(false);
  });

  it("unlock clears unlocking on failure and stays locked", () => {
    const { presenter, resolve } = lockedPresenter();

    presenter.unlock("wrong");
    resolve({ ok: false, reason: "invalid" });

    const after = latest(presenter);
    expect(after.status).toBe("authenticated");
    expect(after.unlocking).toBe(false);
    expect(after.locked).toBe(true);
    expect(after.error).toBe("Invalid credentials");
  });
});

interface AuthStatusSnapshot {
  readonly status: AuthViewState["status"];
  readonly user: AuthViewState["user"];
}

/** An `AuthPort` stub whose `login()` calls are recorded for later assertion. */
interface FakeAuthPort extends AuthPort {
  readonly calls: ReadonlyArray<readonly [username: string, password: string]>;
}

/** A stub `AuthPort` that resolves every `login()` call with the same preprogrammed outcome, recording its args. */
function fakeAuthPort(outcome: AuthOutcome): FakeAuthPort {
  const calls: Array<readonly [string, string]> = [];

  return {
    calls,
    login(username: string, password: string): ReturnType<AuthPort["login"]> {
      calls.push([username, password]);
      return of(outcome);
    },
  };
}

/** An `AuthPort` stub whose outcome the test resolves explicitly, so the
 * in-flight state is observable. `fakeAuthPort` uses `of(outcome)`, which
 * emits synchronously and skips straight past the wait state.
 *
 * Each `login()` call gets its own `Subject`, and `resolve()` always targets
 * the most recent one — mirroring how a real `AuthPort` call is an
 * independent async operation. `AuthPresenter` never unsubscribes its
 * internal `.subscribe()` callback, so a single shared `Subject` across calls
 * would let a *stale* subscription (e.g. the initial `login()` from
 * `lockedPresenter`'s setup) also receive a later `resolve()` meant for
 * `unlock()` — silently re-running `handleLoginOutcome` and clobbering
 * `status` out from under the in-flight `unlock()` assertions. */
function deferredAuthPort(): {
  readonly port: AuthPort;
  readonly resolve: (outcome: AuthOutcome) => void;
} {
  let current: Subject<AuthOutcome> | null = null;

  return {
    port: {
      login(): Observable<AuthOutcome> {
        const subject = new Subject<AuthOutcome>();
        current = subject;
        return subject.asObservable();
      },
    },
    resolve: (outcome: AuthOutcome): void => {
      current?.next(outcome);
    },
  };
}

/** A presenter already logged in as USER and then locked — the LockScreen state. */
function lockedPresenter(): {
  readonly presenter: AuthPresenter;
  readonly resolve: (outcome: AuthOutcome) => void;
} {
  const { port, resolve } = deferredAuthPort();
  const presenter = new AuthPresenter(port, new InMemorySessionStore());

  presenter.login("astark", "mcdc2026");
  resolve({ ok: true, token: "t", user: USER, exp: 9e12 });
  presenter.lock();

  return { presenter, resolve };
}

function latest(presenter: AuthPresenter): AuthViewState {
  let state: AuthViewState | undefined;
  const sub = presenter.state$.subscribe((s) => {
    state = s;
  });
  sub.unsubscribe();

  if (!state) {
    throw new Error("state$ did not emit synchronously");
  }

  return state;
}
