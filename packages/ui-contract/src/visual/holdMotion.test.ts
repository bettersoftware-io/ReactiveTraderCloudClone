import { afterEach, describe, expect, it, vi } from "vitest";

import { settleAnimationsForCapture } from "./holdMotion";

/**
 * This package's vitest runs in the NODE environment — there is no DOM here at
 * all, and jsdom (the tier next door) implements no Web Animations API, so
 * neither could exercise this function against real animations. What IS
 * testable without a browser is the branch table: which of `cancel` / `pause` +
 * `currentTime = 0` / `finish` each animation shape receives, and — by
 * capturing the subscribed handler and CALLING it over an animation that
 * arrived after the first sweep — that the re-settle actually re-settles.
 * (Pinning only the event NAMES would not: wiring the listeners to a no-op
 * passed such a test, which is how this file used to be.) That is the whole
 * behavioural surface — the function does nothing else — so it is stubbed here
 * against fake `document.getAnimations()` entries. The real Web-Animations semantics
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

  it("subscribes to both of the events Playwright's pass subscribes to", () => {
    expect(settleWith([]).subscribed).toEqual([
      "animationstart",
      "transitionrun",
    ]);
  });

  it("re-settles the whole branch table for motion that starts later", () => {
    // The capture window spans `toHaveScreenshot`'s retry loop, and an
    // animation that begins inside it has to be settled before it reaches
    // film — a one-shot sweep at readiness let 27 goldens outside the
    // countdown family go red on climbing pixel counts. So this drives the
    // registered handler rather than merely asserting it exists: the whole
    // point is WHAT it does when a newcomer appears.
    const harness = settleWith([]);
    const lateHold = fakeAnimation(
      fakeEffect(fakeTarget("fast-forwarded"), 10_000),
    );

    const lateOrdinary = fakeAnimation(fakeEffect(fakeTarget(null), 500));
    const lateInfinite = fakeAnimation(
      fakeEffect(fakeTarget(null), Number.POSITIVE_INFINITY),
    );

    harness.mount(lateHold);
    harness.mount(lateOrdinary);
    harness.mount(lateInfinite);
    harness.dispatch("animationstart");

    expect(lateHold.calls).toEqual(["pause"]);
    expect(lateHold.currentTime).toBe(0);
    expect(lateOrdinary.calls).toEqual(["finish"]);
    expect(lateInfinite.calls).toEqual(["cancel"]);
  });

  it("re-settles a transition that starts later", () => {
    const harness = settleWith([]);
    const lateTransition = fakeAnimation(fakeEffect(fakeTarget(null), 200));

    harness.mount(lateTransition);
    harness.dispatch("transitionrun");

    expect(lateTransition.calls).toEqual(["finish"]);
  });

  it("leaves motion already settled by the first sweep alone on a re-settle", () => {
    // Idempotence is what makes standing listeners safe: a re-settle must not
    // re-seek a held bar away from its mount frame, nor re-finish a finished
    // entrance.
    const held = fakeAnimation(
      fakeEffect(fakeTarget("fast-forwarded"), 10_000),
    );
    const harness = settleWith([held]);

    harness.dispatch("animationstart");

    expect(held.calls).toEqual(["pause", "pause"]);
    expect(held.currentTime).toBe(0);
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

interface SettleHarness {
  /** Event names the pass subscribed to, in subscription order. */
  readonly subscribed: string[];
  /** Adds an animation that appears after the first sweep has run. */
  mount: (animation: FakeAnimation) => void;
  /** Fires one subscribed event at the handler the pass actually registered. */
  dispatch: (type: string) => void;
}

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

/**
 * Runs the pass over `animations` and hands back the page it was run against:
 * which events it subscribed to, a way to mount motion that appears AFTER the
 * first sweep, and a way to fire one of those events at the handler it
 * actually registered. `dispatch` throws on an unsubscribed event rather than
 * no-op'ing, so dropping a listener fails loudly instead of vacuously.
 */
function settleWith(animations: readonly FakeAnimation[]): SettleHarness {
  const live = [...animations];
  const subscribed: string[] = [];
  const handlers = new Map<string, () => void>();

  vi.stubGlobal("KeyframeEffect", FakeKeyframeEffect);
  vi.stubGlobal("document", {
    getAnimations: (): readonly FakeAnimation[] => {
      return live;
    },
    addEventListener: (type: string, handler: () => void): void => {
      subscribed.push(type);
      handlers.set(type, handler);
    },
  });
  settleAnimationsForCapture();

  return {
    subscribed,
    mount: (animation: FakeAnimation): void => {
      live.push(animation);
    },
    dispatch: (type: string): void => {
      const handler = handlers.get(type);

      if (handler === undefined) {
        throw new Error(`nothing subscribed to "${type}"`);
      }

      handler();
    },
  };
}
