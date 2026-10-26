import { describe, expect, it, vi } from "vitest";

import type { AuthViewState, StoredSession } from "@rtc/core-api";
import {
  type AuthOutcome,
  DEFAULT_LOGIN_WAIT_VARIANT,
  LOGIN_WAIT_VARIANTS,
  type LoginWaitVariant,
  ROSTER,
  type RosterEntry,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

const NOW: number = 1_800_000_000_000;
const NEXT_VARIANT: LoginWaitVariant =
  LOGIN_WAIT_VARIANTS[
    (LOGIN_WAIT_VARIANTS.indexOf(DEFAULT_LOGIN_WAIT_VARIANT) + 1) %
      LOGIN_WAIT_VARIANTS.length
  ];
const DEMO: RosterEntry = ROSTER[0];

const SIGNED_OUT: AuthViewState = {
  status: "unauthenticated",
  user: null,
  locked: false,
  unlocking: false,
  error: null,
  failure: null,
  waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
};

const SESSION_ENDED: AuthViewState = {
  ...SIGNED_OUT,
  error: "Your session has ended. Please sign in again.",
  failure: "session_ended",
};

/** `presenters.auth` — the login / lock / unlock / logout lifecycle over the
 * auth port and the session store. Every case pins the clock at `NOW`
 * BEFORE composing, because the session is resumed at composition.
 *
 * Signing out (`logout()`, or the transport's session end) releases a login
 * or unlock still in flight: its port call is unsubscribed, and an outcome
 * that lands in the same turn as the sign-out — before an Effect interrupt
 * has been delivered — commits nothing. Uncontracted (ruling 6): the order
 * two overlapping logins settle in. */
export function describeAuthContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("with an empty store it starts signed out", async () => {
      await withFakeClock(async () => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.auth.state$);
          expect(c.values).toEqual([SIGNED_OUT]);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("resumes a stored session that has not expired", async () => {
      await withFakeClock(async () => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ session: createSession(NOW + 1) });

        try {
          const c = collect(h.app.presenters.auth.state$);
          expect(c.values).toEqual([
            { ...SIGNED_OUT, status: "authenticated", user: DEMO.user },
          ]);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a session expiring exactly now is expired: signed out, and the store cleared", async () => {
      await withFakeClock(async () => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ session: createSession(NOW) });

        try {
          const c = collect(h.app.presenters.auth.state$);
          expect(c.values).toEqual([SIGNED_OUT]);
          expect(h.driver.storedSession()).toBeNull();
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("login shows authenticating with this attempt's wait treatment, then a success signs in and writes the session", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          auth.login(DEMO.username, "pw");
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            ...SIGNED_OUT,
            status: "authenticating",
          });
          expect(h.driver.pendingLogins()).toEqual([
            { username: DEMO.username, password: "pw" },
          ]);
          h.driver.resolveLogin({
            ok: true,
            token: "tok",
            user: DEMO.user,
            exp: NOW + 1_000,
          });
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            ...SIGNED_OUT,
            status: "authenticated",
            user: DEMO.user,
          });
          expect(h.driver.storedSession()).toEqual({
            token: "tok",
            user: DEMO.user,
            username: DEMO.username,
            exp: NOW + 1_000,
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("each login attempt advances the wait treatment to the next one in the cycle", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          auth.login(DEMO.username, "wrong");
          // Advanced through the PREFERENCE, at the attempt, not on its
          // outcome: an attempt abandoned by a reload still moves the cycle.
          expect(h.driver.storedLoginWaitVariant()).toBe(NEXT_VARIANT);
          h.driver.resolveLogin({ ok: false, reason: "invalid" });
          await clock.settle();
          auth.login(DEMO.username, "wrong");
          await clock.settle();
          expect(c.values.at(-1)?.waitVariant).toBe(NEXT_VARIANT);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    // The cycle has only two treatments, so an advance made while pinned is
    // visible only when the pin EQUALS the stored treatment (its successor is
    // then the other one). The case pins the other treatment first — an
    // unpinned read would show the stored one — then the stored one.
    it("a pinned wait style is the treatment every attempt shows, and the cycle does not move while pinned", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const auth = h.app.presenters.auth;
          const prefs = h.app.presenters.loginWaitPreferences;
          const c = collect(auth.state$);
          prefs.setStyle(NEXT_VARIANT);
          await clock.settle();
          auth.login(DEMO.username, "pw");
          await clock.settle();
          expect(c.values.at(-1)?.waitVariant).toBe(NEXT_VARIANT);
          prefs.setStyle(DEFAULT_LOGIN_WAIT_VARIANT);
          await clock.settle();
          auth.login(DEMO.username, "pw");
          await clock.settle();
          expect(c.values.at(-1)?.waitVariant).toBe(DEFAULT_LOGIN_WAIT_VARIANT);
          expect(h.driver.storedLoginWaitVariant()).toBe(
            DEFAULT_LOGIN_WAIT_VARIANT,
          );
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a rejected or unavailable login signs out with the matching error line", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          auth.login(DEMO.username, "wrong");
          h.driver.resolveLogin({ ok: false, reason: "invalid" });
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            status: "unauthenticated",
            error: "Invalid credentials",
            failure: "invalid",
          });
          auth.login(DEMO.username, "pw");
          h.driver.resolveLogin({ ok: false, reason: "unavailable" });
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            status: "unauthenticated",
            error: "Service unavailable",
          });
          expect(h.driver.storedSession()).toBeNull();
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it.each([
      ["invalid", "Invalid credentials"],
      ["unavailable", "Service unavailable"],
      ["unconfirmed", "Email not confirmed"],
      ["pending", "Account awaiting approval"],
      ["blocked", "Account blocked"],
    ] as const)(
      "a login refused with %s is signed out with that reason and its text",
      async (reason, text) => {
        await withFakeClock(async (clock) => {
          vi.setSystemTime(NOW);
          const h = makeHarness();

          try {
            const c = collect(h.app.presenters.auth.state$);
            h.app.presenters.auth.login(DEMO.username, "pw");
            h.driver.resolveLogin({ ok: false, reason });
            await clock.settle();
            expect(c.values.at(-1)).toEqual({
              ...SIGNED_OUT,
              error: text,
              failure: reason,
              waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
            });
            c.unsubscribe();
          } finally {
            await h.teardown();
          }
        });
      },
    );

    it("a refused unlock keeps the session locked and carries the reason", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ session: createSession(NOW + 1) });

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          auth.lock();
          auth.unlock("pw");
          h.driver.resolveLogin({ ok: false, reason: "blocked" });
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            locked: true,
            unlocking: false,
            failure: "blocked",
            error: "Account blocked",
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("accounts is the port's account flows: a call reaches the port once and is not counted as a login", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const call = h.app.presenters.auth.accounts
            .register("a@b.co", "Ann")
            .subscribe();
          await clock.settle();
          expect(h.driver.portCalls("auth.register")).toBe(1);
          expect(h.driver.pendingAccountCalls()).toEqual([
            { kind: "register", email: "a@b.co", displayName: "Ann" },
          ]);
          call.unsubscribe();
          expect(h.driver.portCalls("auth.login")).toBe(0);
          expect(h.driver.pendingLogins()).toEqual([]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("lock is ignored while signed out, and locks a signed-in session", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const out = makeHarness();
        const signedIn = makeHarness({ session: createSession(NOW + 1) });

        try {
          const c = collect(out.app.presenters.auth.state$);
          out.app.presenters.auth.lock();
          await clock.settle();
          expect(c.values).toEqual([SIGNED_OUT]);
          const d = collect(signedIn.app.presenters.auth.state$);
          signedIn.app.presenters.auth.lock();
          await clock.settle();
          expect(d.values.at(-1)).toMatchObject({
            status: "authenticated",
            locked: true,
          });
          c.unsubscribe();
          d.unsubscribe();
        } finally {
          await out.teardown();
          await signedIn.teardown();
        }
      });
    });

    it("unlock re-authenticates the current user: success unlocks and rewrites the session, failure stays locked with the error", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ session: createSession(NOW + 1) });

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          auth.lock();
          auth.unlock("wrong");
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            locked: true,
            unlocking: true,
            error: null,
          });
          expect(h.driver.pendingLogins()).toEqual([
            { username: DEMO.username, password: "wrong" },
          ]);
          h.driver.resolveLogin({ ok: false, reason: "invalid" });
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            locked: true,
            unlocking: false,
            error: "Invalid credentials",
          });
          auth.unlock("pw");
          h.driver.resolveLogin({
            ok: true,
            token: "tok-2",
            user: DEMO.user,
            exp: NOW + 5_000,
          });
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            status: "authenticated",
            locked: false,
            unlocking: false,
            error: null,
          });
          expect(h.driver.storedSession()?.token).toBe("tok-2");
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("unlock with nobody signed in — from the start, or after logout — makes no login call", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const fresh = makeHarness();
        const h = makeHarness({ session: createSession(NOW + 1) });

        try {
          fresh.app.presenters.auth.unlock("pw");
          const auth = h.app.presenters.auth;
          auth.logout();
          auth.unlock("pw");
          await clock.settle();
          expect(fresh.driver.portCalls("auth.login")).toBe(0);
          expect(h.driver.portCalls("auth.login")).toBe(0);
        } finally {
          await fresh.teardown();
          await h.teardown();
        }
      });
    });

    it("the transport's sessionEnded signs an authenticated user out with the reason and the copy, and clears the store", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({
          session: createSession(NOW + 1_000),
          transport: true,
        });

        try {
          const c = collect(h.app.presenters.auth.state$);
          expect(c.values.at(-1)?.status).toBe("authenticated");
          expect(h.driver.transportCalls()).toEqual(["connect"]);
          h.driver.endSession();
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            ...SIGNED_OUT,
            error: "Your session has ended. Please sign in again.",
            failure: "session_ended",
          });
          expect(h.driver.storedSession()).toBeNull();
          // The transport gate then closes the socket.
          expect(h.driver.transportCalls()).toEqual(["connect", "disconnect"]);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a session end while signed out changes nothing", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ transport: true });

        try {
          const c = collect(h.app.presenters.auth.state$);
          h.driver.endSession();
          await clock.settle();
          expect(c.values).toEqual([SIGNED_OUT]);
          expect(h.driver.transportCalls()).toEqual(["disconnect"]);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("subscribes the transport's sessionEnded exactly once, at construction, and never the connection events", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({
          session: createSession(NOW + 1_000),
          transport: true,
        });

        try {
          expect(h.driver.portCalls("transport.sessionEnded")).toBe(1);
          // Nothing but the status fold may hold the connection events, and
          // nothing here subscribed the status.
          expect(h.driver.connectionEventSubscriptions()).toBe(0);
          h.driver.endSession();
          await clock.settle();
          expect(h.driver.portCalls("transport.sessionEnded")).toBe(1);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a core with no transport opens no session-end subscription", async () => {
      const h = makeHarness();

      try {
        expect(h.ports.transport).toBeUndefined();
        expect(h.driver.portCalls("transport.sessionEnded")).toBe(0);
        expect(h.driver.connectionEventSubscriptions()).toBe(0);
      } finally {
        await h.teardown();
      }
    });

    it("logout signs out and clears the store", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ session: createSession(NOW + 1) });

        try {
          const c = collect(h.app.presenters.auth.state$);
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(c.values.at(-1)).toEqual(SIGNED_OUT);
          expect(h.driver.storedSession()).toBeNull();
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    // An outcome landing AFTER the sign-out finds the port call released (or,
    // on the Effect core, an interrupt not yet delivered); one landing JUST
    // BEFORE it, in the same turn, may not have been committed yet (the async
    // core commits a microtask later, the Effect core a fiber step later) —
    // either way the sign-out has the last word.
    it.each(createSignOutRaces())(
      "%s while %s is in flight: an outcome that %s, landing %s it in the same turn, writes no session and the sign-out stands",
      async (signOut, attempt, _, order, outcome) => {
        await withFakeClock(async (clock) => {
          vi.setSystemTime(NOW);
          const h = makeHarness(
            attempt === "an unlock"
              ? { session: createSession(NOW + 1_000), transport: true }
              : {},
          );

          try {
            const auth = h.app.presenters.auth;
            const c = collect(auth.state$);

            if (attempt === "an unlock") {
              auth.lock();
              auth.unlock("pw");
            } else {
              auth.login(DEMO.username, "pw");
            }

            await clock.settle();
            expect(h.driver.pendingLogins()).toHaveLength(1);

            if (order === "just before") {
              h.driver.resolveLogin(outcome);
            }

            if (signOut === "logout") {
              auth.logout();
            } else {
              h.driver.endSession();
            }

            if (order === "after") {
              h.driver.resolveLogin(outcome);
            }

            await clock.settle();
            expect(c.values.at(-1)).toEqual(
              signOut === "logout" ? SIGNED_OUT : SESSION_ENDED,
            );
            expect(h.driver.storedSession()).toBeNull();
            c.unsubscribe();
          } finally {
            await h.teardown();
          }
        });
      },
    );

    it.each([
      ["logout() releases an unlock in flight", "unlock", "logout"],
      ["a session end releases an unlock in flight", "unlock", "endSession"],
      ["logout() releases a login in flight", "login", "logout"],
      ["dispose() releases a login in flight", "login", "dispose"],
    ] as const)(
      "%s: its port call is unsubscribed",
      async (_, attempt, signOut) => {
        await withFakeClock(async (clock) => {
          vi.setSystemTime(NOW);
          const h = makeHarness(
            attempt === "unlock"
              ? { session: createSession(NOW + 1_000), transport: true }
              : {},
          );

          try {
            const auth = h.app.presenters.auth;

            if (attempt === "unlock") {
              auth.lock();
              auth.unlock("pw");
            } else {
              auth.login(DEMO.username, "pw");
            }

            await clock.settle();
            expect(h.driver.pendingLogins()).toHaveLength(1);

            if (signOut === "logout") {
              auth.logout();
            } else if (signOut === "endSession") {
              h.driver.endSession();
            } else {
              await h.app.dispose();
            }

            await clock.settle();
            expect(h.driver.pendingLogins()).toEqual([]);
            expect(h.driver.storedSession()).toBeNull();
          } finally {
            await h.teardown();
          }
        });
      },
    );

    it("a login after a logout that released one in flight still signs in", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          auth.login(DEMO.username, "first");
          auth.logout();
          auth.login(DEMO.username, "pw");
          await clock.settle();
          expect(h.driver.pendingLogins()).toEqual([
            { username: DEMO.username, password: "pw" },
          ]);
          h.driver.resolveLogin(createOkOutcome());
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            status: "authenticated",
            user: DEMO.user,
            error: null,
          });
          expect(h.driver.storedSession()?.token).toBe("tok-late");
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a double-submitted login that succeeds twice ends signed in", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          auth.login(DEMO.username, "pw");
          auth.login(DEMO.username, "pw");
          const ok = {
            ok: true as const,
            token: "tok",
            user: DEMO.user,
            exp: NOW + 1_000,
          };
          h.driver.resolveLogin(ok);
          h.driver.resolveLogin(ok);
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({
            status: "authenticated",
            user: DEMO.user,
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });
  });
}

type SignOutRace = readonly [
  signOut: "logout" | "a session end",
  attempt: "an unlock" | "a login",
  outcomeText: string,
  order: "after" | "just before",
  outcome: AuthOutcome,
];

/** Every sign-out × attempt in flight × outcome × arrival order. A session
 * end only ever meets an unlock: it is a no-op unless a session is
 * authenticated, and a login is not one. */
function createSignOutRaces(): readonly SignOutRace[] {
  const pairs = [
    ["logout", "an unlock"],
    ["a session end", "an unlock"],
    ["logout", "a login"],
  ] as const;

  const outcomes = [
    ["succeeds", createOkOutcome()],
    ["is refused", createRefusedOutcome()],
  ] as const;
  const orders = ["after", "just before"] as const;

  return pairs.flatMap(([signOut, attempt]) => {
    return outcomes.flatMap(([outcomeText, outcome]) => {
      return orders.map((order): SignOutRace => {
        return [signOut, attempt, outcomeText, order, outcome];
      });
    });
  });
}

function createRefusedOutcome(): AuthOutcome {
  return { ok: false, reason: "invalid" };
}

function createOkOutcome(): AuthOutcome {
  return { ok: true, token: "tok-late", user: DEMO.user, exp: NOW + 5_000 };
}

function createSession(exp: number): StoredSession {
  return { token: "stored", user: DEMO.user, username: DEMO.username, exp };
}
