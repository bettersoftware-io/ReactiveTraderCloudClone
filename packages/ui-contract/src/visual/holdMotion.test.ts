import { afterEach, describe, expect, it, vi } from "vitest";

import { settleAnimationsForCapture } from "./holdMotion";

/**
 * This package's vitest runs in the NODE environment — there is no DOM here at
 * all, and jsdom (the tier next door) implements no Web Animations API, so
 * neither could exercise this function against real animations. What IS
 * testable without a browser is the branch table: which of `cancel` / `pause` +
 * `currentTime = 0` / `finish` each animation shape receives, and that the
 * pass stays subscribed for later motion. That is the whole behavioural
 * surface — the function does nothing else — so it is stubbed here against
 * fake `document.getAnimations()` entries. The real Web-Animations semantics
 * behind the branches (that `currentTime = 0` on a negative-delay animation
 * renders the mount frame) are witnessed by the pixel tier's countdown
 * goldens, which is the only place they CAN be witnessed.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settleAnimationsForCapture", () => {
  it("finishes an ordinary finite animation, as Playwright's pass does", () => {
    const animation = fakeAnimation(fakeEffect(fakeTarget(null), 500));

    settleWith([animation]);

    expect(animation.calls).toEqual(["finish"]);
    expect(animation.currentTime).toBe(UNTOUCHED_CURRENT_TIME);
  });

  it("cancels an infinite animation, as Playwright's pass does", () => {
    const animation = fakeAnimation(
      fakeEffect(fakeTarget(null), Number.POSITIVE_INFINITY),
    );

    settleWith([animation]);

    expect(animation.calls).toEqual(["cancel"]);
  });

  it("holds a fast-forwarded animation paused at its mount frame", () => {
    const animation = fakeAnimation(
      fakeEffect(fakeTarget("fast-forwarded"), 10_000),
    );

    settleWith([animation]);

    expect(animation.calls).toEqual(["pause"]);
    expect(animation.currentTime).toBe(0);
  });

  it("finishes an animation whose target carries some other data-motion", () => {
    const animation = fakeAnimation(
      fakeEffect(fakeTarget("decorative"), 10_000),
    );

    settleWith([animation]);

    expect(animation.calls).toEqual(["finish"]);
  });

  it("cancels an infinite animation even on a fast-forwarded target", () => {
    // The infinite check comes FIRST on purpose: there is no mount frame to
    // hold a never-ending animation at, and `finish()` would throw on one.
    const animation = fakeAnimation(
      fakeEffect(fakeTarget("fast-forwarded"), Number.POSITIVE_INFINITY),
    );

    settleWith([animation]);

    expect(animation.calls).toEqual(["cancel"]);
  });

  it("leaves an effect-less animation and a zero-playback-rate one alone", () => {
    const effectless = fakeAnimation(null);
    const held = fakeAnimation(fakeEffect(fakeTarget(null), 500), 0);

    settleWith([effectless, held]);

    expect(effectless.calls).toEqual([]);
    expect(held.calls).toEqual([]);
  });

  it("keeps settling motion that starts later, as Playwright's pass does", () => {
    // The capture window spans `toHaveScreenshot`'s retry loop, and an
    // animation that begins inside it has to be settled before it reaches
    // film — a one-shot sweep at readiness let 27 goldens outside the
    // countdown family go red on climbing pixel counts.
    expect(settleWith([])).toEqual(["animationstart", "transitionrun"]);
  });

  it("settles every animation on the page, not just the first", () => {
    const infinite = fakeAnimation(
      fakeEffect(fakeTarget(null), Number.POSITIVE_INFINITY),
    );

    const fastForwarded = fakeAnimation(
      fakeEffect(fakeTarget("fast-forwarded"), 10_000),
    );

    const ordinary = fakeAnimation(fakeEffect(fakeTarget(null), 500));

    settleWith([infinite, fastForwarded, ordinary]);

    expect(infinite.calls).toEqual(["cancel"]);
    expect(fastForwarded.calls).toEqual(["pause"]);
    expect(ordinary.calls).toEqual(["finish"]);
  });
});

/** A `currentTime` no branch should write, so "was it re-seeked" is legible. */
const UNTOUCHED_CURRENT_TIME = 1234;

interface FakeTarget {
  getAttribute: (name: string) => string | null;
}

interface FakeComputedTiming {
  endTime: number;
}

interface FakeAnimation {
  readonly calls: string[];
  currentTime: number;
  readonly effect: FakeKeyframeEffect | null;
  readonly playbackRate: number;
  cancel: () => void;
  pause: () => void;
  finish: () => void;
}

/**
 * The one class in this file, and it has to be a class: the function under
 * test narrows an effect with `instanceof KeyframeEffect` (the browser-honest
 * check), so the fake effects must be instances of whatever is stubbed in as
 * that global.
 */
class FakeKeyframeEffect {
  public constructor(
    public readonly target: FakeTarget | null,
    private readonly endTime: number,
  ) {}

  public getComputedTiming(): FakeComputedTiming {
    return { endTime: this.endTime };
  }
}

function fakeTarget(motion: string | null): FakeTarget {
  return {
    getAttribute: (name: string): string | null => {
      return name === "data-motion" ? motion : null;
    },
  };
}

function fakeEffect(target: FakeTarget, endTime: number): FakeKeyframeEffect {
  return new FakeKeyframeEffect(target, endTime);
}

function fakeAnimation(
  effect: FakeKeyframeEffect | null,
  playbackRate = 1,
): FakeAnimation {
  const calls: string[] = [];

  return {
    calls,
    currentTime: UNTOUCHED_CURRENT_TIME,
    effect,
    playbackRate,
    cancel: (): void => {
      calls.push("cancel");
    },
    pause: (): void => {
      calls.push("pause");
    },
    finish: (): void => {
      calls.push("finish");
    },
  };
}

/** Runs the pass over `animations`; returns the event names it subscribed to. */
function settleWith(animations: readonly FakeAnimation[]): string[] {
  const subscribed: string[] = [];

  vi.stubGlobal("KeyframeEffect", FakeKeyframeEffect);
  vi.stubGlobal("document", {
    getAnimations: (): readonly FakeAnimation[] => {
      return animations;
    },
    addEventListener: (type: string): void => {
      subscribed.push(type);
    },
  });
  settleAnimationsForCapture();

  return subscribed;
}
