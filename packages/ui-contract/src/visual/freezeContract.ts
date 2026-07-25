import { fixtures } from "./fixtures";
import { scenarios } from "./scenarios";

/**
 * The power-saver "freeze" contract, asserted against the live DOM rather than
 * a pixel golden.
 *
 * WHY THIS TIER EXISTS. Freeze promises "no decorative motion, and the render
 * stays legible". `index.css` delivers it by forcing `animation-duration` to
 * 0.01ms, `animation-iteration-count` to 1, and both delays to 0. Nothing else
 * could prove that held:
 *
 *  - jsdom (unit + contract tiers) never runs CSS animations at all.
 *  - The pixel tier can't either: `toHaveScreenshot({ animations: "disabled" })`
 *    calls `animation.finish()` on every animation, which jumps straight to the
 *    end state and BYPASSES `animation-delay`. So an element held invisible by
 *    `animation: fade 0.5s 0.35s backwards` photographs perfectly while being
 *    blank for 350ms in the real browser.
 *
 * Reading computed style directly sidesteps both: `animations: "disabled"` is a
 * screenshot option, so a plain `page.evaluate` observes genuine live state.
 *
 * This is the regression witness for a bug that actually shipped —
 * HandshakeConsole's `.sealed` line blanked itself for 350ms on exactly the
 * GPU-less machines freeze exists to help, and only code review caught it.
 */

export interface FreezeViolation {
  /** Human-readable locator for the offending element. */
  readonly element: string;
  /** The CSS property whose computed value breaks the contract. */
  readonly property: string;
  /** What it actually computed to. */
  readonly actual: string;
}

/**
 * Every theme-matrix-expanded scenario whose fixture seeds the freeze tier.
 * Derived from the fixtures rather than hand-listed, so a new freeze scenario
 * is covered the moment it is added.
 */
export const FREEZE_SCENARIOS: readonly string[] = Object.entries(scenarios)
  .filter(([, scenario]) => {
    return fixtures[scenario.fixtureKey]?.powerSaverLevel === "freeze";
  })
  .map(([name]) => {
    return name;
  });

/**
 * Walks the rendered document and reports every computed-style violation of the
 * freeze contract.
 *
 * MUST stay self-contained — Playwright serialises this function's source and
 * evaluates it in the browser, so it cannot close over anything at module
 * scope (no imports, no outer consts). The nested declarations below are for
 * that reason, not by accident.
 */
export function collectFreezeViolations(): FreezeViolation[] {
  // Anything at or below this is "instant". The stylesheet targets 0.01ms; the
  // 1ms ceiling leaves room for serialisation rounding without admitting a real
  // animation (the shortest real one in the app is 150ms).
  const instantSeconds = 0.001;
  const violations: FreezeViolation[] = [];

  function toSeconds(value: string): number {
    const parsed = Number.parseFloat(value);

    if (Number.isNaN(parsed)) {
      return 0;
    }

    return value.trim().endsWith("ms") ? parsed / 1000 : parsed;
  }

  function describe(el: Element, pseudo: string): string {
    const testId = el.getAttribute("data-testid");
    const cls = el.getAttribute("class");
    const testIdPart = testId === null ? "" : `[data-testid="${testId}"]`;
    const clsPart =
      cls === null || cls.trim() === ""
        ? ""
        : `.${cls.trim().split(/\s+/).join(".")}`;

    return `${el.tagName.toLowerCase()}${testIdPart}${clsPart}${pseudo}`;
  }

  function exceedsInstant(list: string): boolean {
    return list.split(",").some((part) => {
      return toSeconds(part) > instantSeconds;
    });
  }

  function hasDelay(list: string): boolean {
    return list.split(",").some((part) => {
      return toSeconds(part) !== 0;
    });
  }

  function repeats(list: string): boolean {
    return list.split(",").some((part) => {
      return part.trim() !== "1";
    });
  }

  function check(el: Element, pseudo: string): void {
    const style = getComputedStyle(el, pseudo === "" ? undefined : pseudo);

    // A pseudo-element with no `content` generates no box, so its computed
    // animation values are inert and would only add noise.
    if (pseudo !== "" && style.content === "none") {
      return;
    }

    function report(property: string, actual: string): void {
      violations.push({ element: describe(el, pseudo), property, actual });
    }

    // Transitions apply to every element (initial `transition-property: all`),
    // and a non-zero duration or delay here is exactly the lag freeze removes.
    if (exceedsInstant(style.transitionDuration)) {
      report("transition-duration", style.transitionDuration);
    }

    if (hasDelay(style.transitionDelay)) {
      report("transition-delay", style.transitionDelay);
    }

    if (style.animationName === "none") {
      return;
    }

    if (exceedsInstant(style.animationDuration)) {
      report("animation-duration", style.animationDuration);
    }

    // The delay is the one that shipped a bug: freeze used to zero duration but
    // not delay, so `backwards` fill held the `from` keyframe for the full delay.
    if (hasDelay(style.animationDelay)) {
      report("animation-delay", style.animationDelay);
    }

    if (repeats(style.animationIterationCount)) {
      report("animation-iteration-count", style.animationIterationCount);
    }

    // The legibility half of the promise, and a SECONDARY check by design. The
    // caller settles every animation before sampling, so this catches the
    // permanent cases (a base `opacity: 0` with no animation left to reveal it)
    // rather than a transient window. The `animation-delay` assertion above is
    // the primary, timing-independent guard for the delay+`backwards` class —
    // do not drop it on the grounds that this one "covers" the same bug: it
    // does not, precisely because animations have finished by the time we look.
    if (Number.parseFloat(style.opacity) === 0) {
      report("opacity", style.opacity);
    }
  }

  for (const el of Array.from(document.querySelectorAll("*"))) {
    check(el, "");
    check(el, "::before");
    check(el, "::after");
  }

  return violations;
}
