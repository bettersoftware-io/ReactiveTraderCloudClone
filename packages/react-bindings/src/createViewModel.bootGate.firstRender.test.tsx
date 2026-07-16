import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

afterEach(cleanup);

/**
 * Regression test for the one-frame boot-splash flash on a
 * `?nosplash`/webdriver load: useBootGate()'s very FIRST render must already
 * report the presenter's real seeded visibility (false), never a literal
 * `true` default. bind(source$, default) serves the DEFAULT on the first
 * render even over a warm source (react-rxjs builds its own wrapper whose
 * currentValue only fills in once a subscriber attaches, deferred to a
 * passive effect — see useEqWorkspaceState's doc comment in
 * createViewModel.ts), so seeding `true` transiently mounted the opaque boot
 * overlay for one frame — an e2e flake risk.
 *
 * Like the eqWorkspace first-render test beside this one, the value is
 * captured from inside the render body itself (pushed into `renders` as a
 * side effect of rendering): Testing Library's act() flushes passive effects
 * before control returns to the test, so reading result.current afterwards
 * would hide exactly the pre-effect-flush frame this pins down.
 */
describe("createViewModel — useBootGate first-render value (nosplash one-frame-splash regression)", () => {
  it("the FIRST render already reports the presenter's seeded visibility (false), never a true frame", () => {
    const hooks = makeHooks();
    const renders: boolean[] = [];

    function Probe(): null {
      const { visible } = hooks.useBootGate();
      renders.push(visible);
      return null;
    }

    render(<Probe />);

    expect(renders.length).toBeGreaterThan(0);
    expect(renders[0]).toBe(false);
    expect(renders).not.toContain(true);
  });
});

function makeHooks(): ViewModel {
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
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
      // The nosplash/webdriver decision: seed the boot gate hidden.
      bootSplash: {
        shouldPlay: () => {
          return false;
        },
      },
    };
  }
}
