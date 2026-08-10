import { setDriver } from "@ui-contract/harness/activeDriver";
import { cleanupMounted } from "@ui-contract/mount";
import { afterEach } from "vitest";

import { solidDriver } from "./render";

// jsdom (this tier's environment) has no ResizeObserver at all — `SceneCanvas`
// (the canvas-substrate host, Task 4's solid twin) observes its own box
// unconditionally in an effect, so mounting it here throws `ReferenceError:
// ResizeObserver is not defined` without this stub. A pure no-op: it never
// fires a resize callback, so `SceneCanvas`'s box-size state (and the canvas
// element's width/height) never leaves its browser default — fine here
// because every canvas-substrate contract case
// (CanvasSubstrate.contract.spec.ts) asserts DOM presence/attributes, never
// pixels; jsdom has no 2D context regardless.
// eslint-disable-next-line rtc/class-filename-match -- internal shim class in a purpose-named vitest setup module (registered by path in setupFiles)
class ResizeObserverStub {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;

setDriver(solidDriver);
afterEach(() => {
  return cleanupMounted();
});
