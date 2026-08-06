import { renderHook } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

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

/**
 * Solid counterpart of react-bindings' createViewModel.useLayout.test.tsx,
 * ported for Task 11's non-disposing rewrite of `useLayout` (it previously
 * used `useMachine`, matching react-bindings' OLD implementation the review
 * flagged there).
 *
 * `machines.layout(tab)` (client-core's `Presenters.layoutFor`) resolves to
 * a composition-root SINGLETON shared across every mount for that tab — not
 * a fresh instance per mount like every other `useMachine`-bridged factory.
 * `useLayout` reads the singleton directly via `toSignal` (no `useMachine`,
 * no dispose call anywhere in its own implementation) — this proves state a
 * first mount writes survives that mount's unmount (`renderHook`'s own
 * `cleanup()`, which only tears down `toSignal`'s local subscription — see
 * toSignal.ts's own onCleanup), and a fresh remount for the SAME tab sees
 * it, live.
 *
 * NOT a mutation-sensitive regression witness against reverting to
 * `useMachine` here, unlike react-bindings' equivalent test at the time it
 * was written: composition.ts's `layoutFor` (see its own doc) has since made
 * the returned handle's `dispose()` a structurally inert no-op, so a
 * `useMachine`-style consumer calling it is harmless too (see task-10's
 * review-round-1 commit b10d79f51 / composition.layoutFor.test.ts). This
 * test still documents and asserts the CORRECT behaviour and the intended
 * non-disposing pattern (per the Task 11 brief's explicit "move it to the
 * non-disposing consumption" instruction), it just can no longer prove the
 * old pattern was wrong by itself — that proof lives in
 * composition.layoutFor.test.ts, at the layer where it's still load-bearing.
 */
describe("createViewModel — useLayout does not dispose the shared singleton on unmount", () => {
  it("state set by a first mount is still there — and the machine is still LIVE — after that mount unmounts and a new one mounts for the SAME tab", () => {
    const vm = makeViewModel();

    const first = renderHook(() => {
      return vm.useLayout("equities");
    });
    first.result.maximize("eq-chart");
    first.cleanup();

    const second = renderHook(() => {
      return vm.useLayout("equities");
    });

    // The remount's very FIRST read already sees the first mount's write —
    // proof the singleton, not a fresh reset instance, backs both mounts.
    expect(second.result.state().maximized).toBe("eq-chart");
    expect(second.result.state().collapsed).toEqual([]);

    // The remounted read's own intent still dispatches into a LIVE machine:
    // a fresh "collapse" actually lands (a disposed machine could never
    // produce this — its Subjects would be completed, so `.next()` would be
    // a silent no-op).
    second.result.collapse("eq-chart");
    expect(second.result.state().collapsed).toEqual(["eq-chart"]);

    second.cleanup();
  });
});

function makeViewModel(): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());

  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );
}

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
