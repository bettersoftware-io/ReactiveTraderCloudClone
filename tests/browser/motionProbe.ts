/**
 * Browser-side motion probe, shared by the power-saver e2e spec (via the
 * Playwright PowerSaver page object) and the standalone motion audit
 * (`scripts/motion-audit.ts`). Samples the two motion channels the freeze
 * tier must silence and no pixel or jsdom tier can see:
 *
 *  - `document.getAnimations()` — every live CSS animation, CSS transition
 *    and WAAPI animation, with timing + target identity. This is what caught
 *    freeze's original churn leaks: the catch-all's global 0.01ms
 *    `transition-duration` MANUFACTURED a CSSTransition per data-driven style
 *    change (initial `transition-property` is `all`), and retriggered flash
 *    keyframes spawned a fresh 0.01ms Animation per quote.
 *  - `requestAnimationFrame` registrations — an imperative JS loop that
 *    slipped past its TS freeze gate re-registers every frame, so counting
 *    registrations over a window catches it even when instrumentation starts
 *    after the loop did.
 *
 * `sampleMotion` MUST stay self-contained — Playwright serialises the
 * function source and evaluates it in the page, so it cannot close over
 * imports or module-scope values.
 */

export interface MotionSampleOptions {
  /** How many census snapshots to take. */
  readonly samples: number;
  /** Milliseconds between snapshots. */
  readonly intervalMs: number;
}

export interface MotionSample {
  /** rAF callbacks registered while sampling ran. 0 under freeze. */
  readonly rafCallbacks: number;
  /** Sampling wall-clock, for turning rafCallbacks into a rate. */
  readonly elapsedMs: number;
  /**
   * Distinct live (non-`finished`) animations seen across all snapshots, as
   * `Type:name dur=<s> state=<playState> @ <target>` descriptors with the
   * number of snapshots each appeared in. Empty under freeze: `finished`
   * entries cost nothing per frame and are deliberately not reported, but a
   * `running` or `paused` one is decorative motion (or its churn) leaking.
   */
  readonly liveAnimations: readonly string[];
}

export async function sampleMotion(
  options: MotionSampleOptions,
): Promise<MotionSample> {
  const started = performance.now();
  let rafCallbacks = 0;
  const originalRaf = window.requestAnimationFrame.bind(window);

  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    rafCallbacks += 1;

    return originalRaf(callback);
  };

  function describeTarget(effect: AnimationEffect | null): string {
    if (!(effect instanceof KeyframeEffect) || effect.target === null) {
      return "(detached)";
    }

    const el = effect.target;
    const testId = el.getAttribute("data-testid");
    const cls = el.getAttribute("class");

    return [
      el.tagName.toLowerCase(),
      testId === null ? "" : `[data-testid="${testId}"]`,
      cls === null || cls.trim() === ""
        ? ""
        : `.${cls.trim().split(/\s+/).slice(0, 2).join(".")}`,
      effect.pseudoElement ?? "",
    ].join("");
  }

  function describe(animation: Animation): string {
    const name =
      animation instanceof CSSAnimation
        ? animation.animationName
        : animation instanceof CSSTransition
          ? `transition:${animation.transitionProperty}`
          : animation.id === ""
            ? "waapi"
            : animation.id;
    const timing = animation.effect?.getTiming();
    const duration =
      typeof timing?.duration === "number" ? `${timing.duration}ms` : "auto";

    return `${animation.constructor.name}:${name} dur=${duration} state=${animation.playState} @ ${describeTarget(animation.effect)}`;
  }

  const seen = new Map<string, number>();

  try {
    for (let i = 0; i < options.samples; i += 1) {
      for (const animation of document.getAnimations()) {
        if (animation.playState !== "finished") {
          const key = describe(animation);
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }

      await new Promise((resolve) => {
        setTimeout(resolve, options.intervalMs);
      });
    }
  } finally {
    window.requestAnimationFrame = originalRaf;
  }

  return {
    rafCallbacks,
    elapsedMs: performance.now() - started,
    liveAnimations: Array.from(seen.entries()).map(([key, count]) => {
      return `${key} x${count}/${options.samples}`;
    }),
  };
}
