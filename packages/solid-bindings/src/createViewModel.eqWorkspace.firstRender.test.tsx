import { renderHook } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
} from "@rtc/client-core";
import { ConnectionEventsSimulator, PreferencesSimulator } from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

/**
 * Solid counterpart of react-bindings' createViewModel.eqWorkspace.firstRender.test.tsx
 * (the equities white-screen regression pinned there): useEqWorkspace()'s very
 * first read of `state()` must already report the machine's real warm
 * selection, never an empty placeholder that would send `useCandles("", ...)`
 * into the simulator and crash. In react-rxjs, `bind()` built its own wrapper
 * whose currentValue only filled in once react-rxjs's useSyncExternalStore
 * hook attached a subscriber in a passive effect — AFTER the first commit — so
 * the bug only showed up on the render that happens before any effect flush.
 *
 * Solid's `useEqWorkspace` reads `presenters.eqWorkspace.state$` directly via
 * `toSignal` (see createViewModel.ts's UseEqWorkspaceResult doc comment),
 * and `toSignal` subscribes EAGERLY and synchronously seeds the signal before
 * returning (see toSignal.ts) — so there is no passive-effect-deferred window
 * for this to hide in. This test proves that directly: the value read the
 * instant `useEqWorkspace()` returns is already the seeded symbol.
 */
describe("createViewModel — useEqWorkspace first-render value (equities white-screen regression)", () => {
  it("the value read immediately after useEqWorkspace() already reports the seeded watchlist symbol, never the empty placeholder", () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useEqWorkspace();
    });

    // Read synchronously, with no waitFor/effect-flush in between — this is
    // exactly the value a Solid component sees on its one and only render.
    expect(result.state().sel).toBe("AAPL");
    expect(result.state().sel).not.toBe("");
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
    ...createSimulatorPorts({ preferences: new PreferencesSimulator() }),
    connectionEvents: new ConnectionEventsSimulator(),
  };
}
