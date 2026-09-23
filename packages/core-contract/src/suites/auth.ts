import { describe, expect, it, vi } from "vitest";

import type { AuthViewState, StoredSession } from "@rtc/core-api";
import {
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
  waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
};

/** `presenters.auth` — the login / lock / unlock / logout lifecycle over the
 * auth port and the session store. Every case pins the clock at `NOW`
 * BEFORE composing, because the session is resumed at composition.
 *
 * Uncontracted (ruling 6): the outcome of a login still in flight when
 * `logout()` runs, and the order two overlapping logins settle in. */
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

    // The store-cleared half cannot fail against a SIBLING core today: the
    // base app it delegates to builds its own auth at composition and
    // resumes — and clears — from the same store (slice-6 ledger A-5). The
    // siblings' own unit tests pin their clear.
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
          expect(c.values.at(-1)?.waitVariant).toBe(NEXT_VARIANT);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a pinned wait style is the treatment every attempt shows, and the cycle does not move while pinned", async () => {
      await withFakeClock(async () => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const auth = h.app.presenters.auth;
          const c = collect(auth.state$);
          h.app.presenters.loginWaitPreferences.setStyle(NEXT_VARIANT);
          auth.login(DEMO.username, "pw");
          expect(c.values.at(-1)?.waitVariant).toBe(NEXT_VARIANT);
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

function createSession(exp: number): StoredSession {
  return { token: "stored", user: DEMO.user, username: DEMO.username, exp };
}
