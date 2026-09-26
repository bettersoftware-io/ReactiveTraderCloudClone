import { setDriver } from "@ui-contract/harness/activeDriver";
import { setLayoutPresetStoreLookup } from "@ui-contract/harness/layoutPresetStore";
import { cleanupMounted } from "@ui-contract/mount";
import { afterEach, vi } from "vitest";

import { reactDriver } from "./render";
import { layoutPresetStoreFor } from "./viewModelFromWorld";

// jsdom (this tier's environment) has no ResizeObserver at all — `SceneCanvas`
// (the canvas-substrate host, Task 3) observes its own box unconditionally in
// a layout effect, so mounting it here throws `ReferenceError: ResizeObserver
// is not defined` without this stub. A pure no-op: it never fires a resize
// callback, so `SceneCanvas`'s box-size state (and the canvas element's
// width/height) never leaves its browser default — fine here because every
// canvas-substrate contract case (CanvasSubstrate.contract.spec.ts) asserts
// DOM presence/attributes, never pixels; jsdom has no 2D context regardless.
// A future contract case that needs real canvas dimensions must upgrade this
// to a stub that FIRES its callback with a synthetic contentRect — this one
// deliberately never will.
class ResizeObserverStub {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;

// @testing-library/react's asyncWrapper (the wrapper round every user-event
// call) ends by draining a `setTimeout(0)`, and advances it only when it
// detects JEST's fake timers — a `jest` global plus a faked `setTimeout`.
// vitest's fake `setTimeout` already carries the `clock` RTL checks for; only
// the global is missing, so under `vi.useFakeTimers()` that drain never fires
// and every interaction hangs (Solid's testing library has no such wrapper).
// The shim forwards the one call RTL makes. Under real timers `setTimeout`
// has no `clock`, RTL's check stays false, and nothing here runs.
(globalThis as Record<string, unknown>).jest = {
  advanceTimersByTime: (ms: number): void => {
    vi.advanceTimersByTime(ms);
  },
};

setDriver(reactDriver);
// The preset store behind this World's ViewModel, for the ONE contract case
// that must delete a record the way another browser tab would (see the
// lookup module's own doc).
setLayoutPresetStoreLookup(layoutPresetStoreFor);
afterEach(() => {
  return cleanupMounted();
});
