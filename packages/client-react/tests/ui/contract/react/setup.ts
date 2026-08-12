import { setDriver } from "@ui-contract/harness/activeDriver";
import { cleanupMounted } from "@ui-contract/mount";
import { afterEach } from "vitest";

import { reactDriver } from "./render";

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
// eslint-disable-next-line rtc/class-filename-match -- internal shim class in a purpose-named vitest setup module (registered by path in setupFiles)
class ResizeObserverStub {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;

setDriver(reactDriver);
afterEach(() => {
  return cleanupMounted();
});
