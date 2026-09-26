import { describe, expect, it, vi } from "vitest";

import type { StoredSession } from "@rtc/core-api";
import { ROSTER, type RosterEntry } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import type { MakeHarness } from "#/harness/harness";

const NOW: number = 1_800_000_000_000;
const DEMO: RosterEntry = ROSTER[0];

/** The auth-gated transport: `ports.transport` opens exactly when
 * `presenters.auth` becomes authenticated and closes when it stops being so
 * — once per edge, never per state emission. The first state counts as an
 * edge: a signed-out start calls `disconnect()` once (idempotent on a socket
 * that never opened), exactly as the RxJS reference does. A property of the whole
 * composition (the gate reads the app's OWN `auth`), so it is not keyed by
 * member. Every case supplies the scripted transport and pins the clock at
 * `NOW` before composing, because a stored session resumes at composition. */
export function describeTransportGateContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(`${label} :: transportGate`, () => {
    it("with no stored session, composition disconnects once and never connects", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ transport: true });

        try {
          expect(h.driver.transportCalls()).toEqual(["disconnect"]);
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["disconnect"]);
          // The app still exposes the transport it was given, whatever it
          // hands anything it composes internally.
          expect(h.app.ports.transport).toBeDefined();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a resumed session connects at composition, synchronously and once", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({
          transport: true,
          session: createSession(NOW + 1_000),
        });

        try {
          expect(h.driver.transportCalls()).toEqual(["connect"]);
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["connect"]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("signing in connects once, and signing out disconnects", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ transport: true });

        try {
          const auth = h.app.presenters.auth;
          auth.login(DEMO.username, "pw");
          await clock.settle();
          // Authenticating is not authenticated: the socket stays shut.
          expect(h.driver.transportCalls()).toEqual(["disconnect"]);
          h.driver.resolveLogin({
            ok: true,
            token: "tok",
            user: DEMO.user,
            exp: NOW + 1_000,
          });
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["disconnect", "connect"]);
          auth.logout();
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual([
            "disconnect",
            "connect",
            "disconnect",
          ]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("lock and unlock stay authenticated, so the transport is not reconnected", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({
          transport: true,
          session: createSession(NOW + 1_000),
        });

        try {
          const auth = h.app.presenters.auth;
          auth.lock();
          await clock.settle();
          auth.unlock("pw");
          await clock.settle();
          h.driver.resolveLogin({
            ok: true,
            token: "tok2",
            user: DEMO.user,
            exp: NOW + 2_000,
          });
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["connect"]);
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
