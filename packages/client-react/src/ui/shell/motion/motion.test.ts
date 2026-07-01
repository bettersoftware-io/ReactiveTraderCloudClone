import { beforeEach, describe, expect, it } from "vitest";

import { animateOnce } from "./index";

beforeEach(() => {
  Element.prototype.animate = (): Animation => {
    return makeFakeAnimation();
  };
});

describe("motion wrapper", () => {
  it("resolves once the animation finishes (jsdom WAAPI shim)", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const result = animateOnce(el, { opacity: [0, 1] }, { duration: 0.01 });
    await expect(result).resolves.toBeUndefined();
    el.remove();
  });

  it("exposes animateOnce as a function", async () => {
    const mod = await import("./index");
    expect(typeof mod.animateOnce).toBe("function");
  });
});

/**
 * jsdom does not implement the WAAPI (Element.animate / Animation).
 * motion's NativeAnimation wraps the raw WAAPI Animation:
 *   element.animate(...) → rawAnimation
 *   rawAnimation.onfinish = () => { ... this.notifyFinished() }   // set by NativeAnimation ctor
 *
 * For the test to resolve, the fake rawAnimation must fire `onfinish` after it
 * is assigned. We use a getter/setter pair so assigning `onfinish` schedules
 * the callback via queueMicrotask — just like a zero-duration real animation.
 *
 * The point of the test is that animateOnce awaits `.finished` and resolves to
 * undefined — not that the real WAAPI pipeline fires.
 */
function makeFakeAnimation(): Animation {
  let _onfinish: (() => void) | null = null;

  const fakeAnimation = {
    get onfinish(): (() => void) | null {
      return _onfinish;
    },
    set onfinish(cb: (() => void) | null) {
      _onfinish = cb;

      if (cb) {
        queueMicrotask(() => {
          return cb();
        });
      }
    },
    playState: "running",
    cancel: () => {},
    pause: () => {},
    play: () => {},
    finish: () => {},
    commitStyles: () => {},
    effect: null,
    currentTime: 0,
    startTime: 0,
    playbackRate: 1,
    oncancel: null,
    onremove: null,
    id: "",
    pending: false,
    ready: Promise.resolve(undefined as unknown as Animation),
    finished: Promise.resolve(undefined as unknown as Animation),
    timeline: null,
    replaceState: "active",
    updatePlaybackRate: () => {},
    persist: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {
      return false;
    },
  } as unknown as Animation;

  return fakeAnimation;
}
