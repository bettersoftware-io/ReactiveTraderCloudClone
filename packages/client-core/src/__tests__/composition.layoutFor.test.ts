import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp } from "#/composition";

// Review round-1 IMPORTANT finding: `layoutFor(tab)` returns the SAME
// composition-root-singleton instance on every call, but `MachineFactories.
// layout`'s SHAPE is identical to every per-mount factory a legacy
// `useMachine` bridge disposes on unmount — exactly what solid-bindings'
// CURRENT `useLayout` still does, ahead of Task 11's non-disposing rewrite
// there. Without a structural guard, that consumer's unmount-time
// `dispose()` call would complete the shared machine's Subjects and leave
// the Map caching a corpse forever, silently breaking every OTHER consumer
// (including a driven "layout" DriveCommand's own target) for the rest of
// the session. `composition.ts`'s `layoutFor` now returns a handle whose
// `dispose()` is a documented no-op — this test proves that invariant
// holds through the real `createApp()` wiring, not just in isolation.
describe("composition — layoutFor singleton dispose is structurally inert", () => {
  it("calling dispose() on one handle does not kill the shared instance for a later caller", async () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    });

    const first = presenters.layoutFor("equities");

    // A legacy useMachine-style consumer unmounting — must be harmless.
    first.dispose();

    const second = presenters.layoutFor("equities");

    // Still the exact SAME cached singleton, not a fresh replacement.
    expect(second).toBe(first);

    // The machine still genuinely folds intents...
    second.intents.maximize("eq-chart");
    const state = await firstValueFrom(second.state$);
    expect(state.maximized).toBe("eq-chart");

    // ...and calling dispose() again (a second unmounting consumer) is
    // equally harmless.
    second.dispose();
    second.intents.restore();
    const restored = await firstValueFrom(second.state$);
    expect(restored.maximized).toBeNull();
  });

  it("different tabs get independent singletons — disposing one never affects the other", async () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    });

    const equities = presenters.layoutFor("equities");
    equities.dispose();

    const fx = presenters.layoutFor("fx");
    expect(fx).not.toBe(equities);

    fx.intents.maximize("fx-rates");
    const fxState = await firstValueFrom(fx.state$);
    expect(fxState.maximized).toBe("fx-rates");
  });
});
