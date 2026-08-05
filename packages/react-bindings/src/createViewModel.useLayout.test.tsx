import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
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
 * Regression witness for the review round-1 IMPORTANT finding: this is the
 * test that would have caught the Solid-side class of bug BEFORE it shipped
 * — no witness like it existed when useLayout was rewritten off useMachine.
 *
 * `machines.layout(tab)` (client-core's `Presenters.layoutFor`) resolves to
 * a composition-root SINGLETON shared across every mount for that tab — not
 * a fresh instance per mount like every other `useMachine`-bridged factory.
 * `useMachine`'s cleanup calls `.dispose()` on whatever instance it's given,
 * which would complete the shared machine's Subjects on the FIRST unmount,
 * leaving every LATER mount for the same tab reading a dead machine.
 * `useLayout` reads the singleton directly via `useStateObservable` (no
 * `useMachine`, no dispose call anywhere in its own implementation) — this
 * proves that holds: state a first mount writes survives that mount's
 * unmount, and a fresh remount for the SAME tab sees it, live.
 */
describe("createViewModel — useLayout does not dispose the shared singleton on unmount", () => {
  it("state set by a first mount is still there — and the machine is still LIVE — after that mount unmounts and a new one mounts for the SAME tab", async () => {
    const hooks = makeHooks();

    function WriterProbe(): null {
      const { maximize } = hooks.useLayout("equities");

      useEffect(() => {
        maximize("eq-chart");
      }, [maximize]);

      return null;
    }

    const first = render(<WriterProbe />);
    first.unmount();

    // Flush a microtask tick before remounting: `useMachine` (the OLD
    // useLayout implementation this guards against regressing back to)
    // defers its dispose() call via `queueMicrotask` — without yielding
    // here first, a reintroduced dispose call wouldn't have run yet by the
    // time the second mount below reads the machine, letting this test
    // pass vacuously regardless of which implementation is live.
    await act(async () => {
      await Promise.resolve();
    });

    const readStates: (string | null)[] = [];
    const collapsedStates: (readonly string[])[] = [];
    let dispatchCollapse: (() => void) | undefined;

    function ReaderProbe(): null {
      const { state, collapse } = hooks.useLayout("equities");
      readStates.push(state.maximized);
      collapsedStates.push(state.collapsed);

      // Captured so the test can also prove the REMOUNTED read's own
      // intents still dispatch into a live machine, not a disposed one — a
      // disposed machine's Subjects are completed, so a real dispatch after
      // a completed Subject would be a silent no-op (never re-render this
      // component), which the assertion below distinguishes from a genuine
      // fold.
      dispatchCollapse = (): void => {
        collapse("eq-chart");
      };

      return null;
    }

    render(<ReaderProbe />);

    // The remount's very FIRST render already sees the first mount's write
    // — proof the singleton, not a fresh reset instance, backs both mounts.
    expect(readStates.length).toBeGreaterThan(0);
    expect(readStates[0]).toBe("eq-chart");
    expect(collapsedStates[0]).toEqual([]);

    // The remounted read's own intent still dispatches into a LIVE machine:
    // a fresh "collapse" actually lands (a disposed machine could never
    // produce this — its Subjects are completed, so .next() would be a
    // silent no-op and collapsedStates would never gain this entry).
    act(() => {
      dispatchCollapse?.();
    });
    expect(collapsedStates.at(-1)).toEqual(["eq-chart"]);
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
    };
  }
}
