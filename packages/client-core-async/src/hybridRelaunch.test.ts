import { NEVER, type Observable, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import {
  createRoutingAuthPort,
  createSimulatorPorts,
  InMemoryDataSourceStore,
  InMemorySessionStore,
  pairConnectionPorts,
} from "@rtc/client-core";
import type { AppPorts } from "@rtc/core-api";
import { withFakeClock } from "@rtc/core-contract";
import {
  type AuthOutcome,
  type AuthPort,
  AuthSimulator,
  PreferencesSimulator,
  type SessionUser,
} from "@rtc/domain";

import { createApp } from "#/composition";

/**
 * The hybrid relaunch path (hardening spec §8.3 step 3) driven through THIS
 * core's real auth presenter: a cross-mode login writes the session and the
 * choice, calls `relaunch()`, and the login observable then NEVER emits.
 *
 * Why this test exists here and not only in client-core: this core awaits the
 * FIRST value of `auth.login` and treats a completion WITHOUT one as an error
 * it rethrows out of band (a macrotask), so a routing port that returned
 * `EMPTY` instead of `NEVER` would pass every client-core unit test and throw
 * an uncaught exception in production on every mode change — on this core
 * only. Under fake timers that rethrow lands inside `clock.settle()`, which
 * is exactly where this test would then fail.
 */
describe("hybrid relaunch through the async core's auth presenter", () => {
  it("a cross-mode login leaves the presenter authenticating, relaunches once, and tears down silently", async () => {
    await withFakeClock(async (clock) => {
      const sessionStore = new InMemorySessionStore();
      const dataSourceStore = new InMemoryDataSourceStore();
      const relaunch = vi.fn();
      const live = createLiveLoginPort(createOkOutcome());
      const auth = createRoutingAuthPort({
        demo: new AuthSimulator({}),
        live,
        composed: "sim",
        sessionStore,
        dataSourceStore,
        relaunch,
      });

      const ports: AppPorts = {
        ...createSimulatorPorts({
          preferences: new PreferencesSimulator({}),
          auth,
          sessionStore,
        }),
        ...pairConnectionPorts(NEVER),
      };
      const app = createApp(ports);
      const states: string[] = [];
      const sub = app.presenters.auth.state$.subscribe((state) => {
        states.push(state.status);
      });

      try {
        app.presenters.auth.login("ada", "hunter2");
        await clock.settle();
        live.answer();
        await clock.settle();

        expect(relaunch).toHaveBeenCalledTimes(1);
        expect(dataSourceStore.read()).toBe("live");
        expect(sessionStore.read()?.username).toBe("ada");
        // Still "authenticating": the presenter never saw an outcome, and
        // never will — the page is about to unload.
        expect(states.at(-1)).toBe("authenticating");
      } finally {
        sub.unsubscribe();
        await app.dispose();
        // A pending login must be released by dispose without an out-of-band
        // rethrow; a completed-without-value one would throw right here.
        await clock.settle();
      }

      expect(states.at(-1)).toBe("authenticating");
    });
  });
});

interface LiveLoginPort extends AuthPort {
  /** Answer the pending login (next + complete), as a server would. */
  answer(): void;
}

/** A live leg the test settles by hand, so the cross-mode decision happens
 * AFTER the presenter has subscribed — the real HTTP leg is async too. */
function createLiveLoginPort(outcome: AuthOutcome): LiveLoginPort {
  const answers = new Subject<AuthOutcome>();
  return {
    login(): Observable<AuthOutcome> {
      return answers.asObservable();
    },
    answer(): void {
      answers.next(outcome);
      answers.complete();
    },
  };
}

function createUser(): SessionUser {
  return {
    name: "Ada Lovelace",
    initials: "AL",
    role: "trader",
    id: "u1",
    email: "ada@example.com",
    desk: "FX",
    clearance: "standard",
  };
}

function createOkOutcome(): AuthOutcome {
  return { ok: true, token: "tok-ada", user: createUser(), exp: 1_800_000_000 };
}
