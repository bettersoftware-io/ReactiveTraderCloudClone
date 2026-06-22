// tests/presenter/vitest-quickpickle-fake-timers/hooks.ts
import { After, Before } from "quickpickle";
import { vi } from "vitest";

import { buildPresenterApp } from "../scenarios/_buildApp";
import { newScratchpad } from "../scenarios/_shared/common";
import type { VitestFakePresenterWorld } from "./world";

Before(async (state: VitestFakePresenterWorld) => {
  // Install fake timers BEFORE buildPresenterApp so simulators capture patched
  // setTimeout/setInterval. Seed virtual now() with real Date.now() so simulator
  // historical timestamps stay sensible.
  vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
  state.ctx = buildPresenterApp();
  state.scratch = newScratchpad();
  state._statusSub = state.ctx.app.presenters.connection.status$.subscribe();
});

After(async (state: VitestFakePresenterWorld) => {
  state._statusSub?.unsubscribe();
  vi.useRealTimers();
});
