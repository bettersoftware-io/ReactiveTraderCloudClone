import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-adapters";
import { createApp, createMachineFactories } from "@rtc/client-core-rxjs";
import type { AppPorts, AuthViewState } from "@rtc/core-api";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

afterEach(cleanup);

/**
 * Regression test for the login screen React committed and removed again
 * within one task on every composition with a resumed session (each boot,
 * and each in-place core swap): useAuth()'s very FIRST render must already
 * report the presenter's real state. The hook used to go through
 * bind(source$, default) with an "unauthenticated" default, and bind serves
 * its default on the first render even over a warm source (see the bootGate
 * first-render test beside this one).
 *
 * As there, the value is captured from inside the render body: Testing
 * Library's act() flushes passive effects before control returns, so
 * reading the result afterwards would hide exactly the first frame.
 */
describe("createViewModel — useAuth first-render value (resumed session)", () => {
  it("the FIRST render already reports the resumed session, never a signed-out frame", () => {
    const hooks = createHooks();
    const renders: AuthViewState["status"][] = [];

    function Probe(): null {
      const { state } = hooks.useAuth();
      renders.push(state.status);
      return null;
    }

    render(<Probe />);

    expect(renders.length).toBeGreaterThan(0);
    expect(renders[0]).toBe("authenticated");
    expect(renders).not.toContain("unauthenticated");
  });
});

function createHooks(): ViewModel {
  const sessionStore = new InMemorySessionStore();
  sessionStore.write({
    token: "resumed-token",
    user: {
      name: "Anthony Stark",
      initials: "AS",
      role: "trader",
      id: "astark",
      email: "astark@example.com",
      desk: "FX",
      clearance: "L3",
    },
    username: "astark",
    exp: Date.now() + 3_600_000,
  });
  const { presenters, commands } = createApp(createSimPorts());

  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  function createSimPorts(): AppPorts {
    return {
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore,
      }),
      connectionEvents: new ConnectionEventsSimulator(),
      connectionIntents: { reconnect: () => {}, injectIncident: () => {} },
      bootSplash: {
        shouldPlay: () => {
          return false;
        },
      },
    };
  }
}
