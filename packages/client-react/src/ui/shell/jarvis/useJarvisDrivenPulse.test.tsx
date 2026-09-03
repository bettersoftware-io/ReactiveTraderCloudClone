/**
 * Regression witness for the review round-1 CRITICAL finding: the driven
 * pulse wraps a real subtree (the whole workspace region / the nav rail),
 * and OTHER animations already live inside that subtree bubble their own
 * `animationend` up to the wrapper — e.g. every FX tile's tick-flash
 * (TilePrice.module.css) on every price update. Without the
 * `event.target !== event.currentTarget` guard (mirrored from
 * RfqCard.tsx's `settleCardTransition` / RfqsPanelPage.ts's
 * `fireCardAnimationEndFromDescendant` precedent), a descendant's
 * animationend tears the pulse down within tens of ms instead of the
 * intended ~700ms.
 *
 * jsdom quirk (documented at RfqsPanelPage.ts:50-61): react-dom's
 * `onAnimationEnd` feature-detects the animationend event name at startup
 * and falls back to the WebKit-prefixed native name whenever
 * `window.AnimationEvent` is undefined — true in this repo's jsdom. So this
 * file fires `webkitAnimationEnd`, not the unprefixed
 * `fireEvent.animationEnd`, which would be silently ignored here.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";

import { jarvisDrivenPulsePage } from "#tests/ui/pages/JarvisDrivenPulsePage";

const page = jarvisDrivenPulsePage();

afterEach(() => {
  page.unmountAll();
});

describe("useJarvisDrivenPulse — descendant animationend guard", () => {
  it("a descendant's bubbling animationend does NOT clear the pulse; the wrapper's OWN animationend does", () => {
    const handle = page.mount(fakeViewModel(false));

    // A new applied outcome arrives — pulsing turns true.
    handle.rerenderWith(fakeViewModel(true));

    expect(page.wrapperDrivenAttr()).toBe("true");

    // A descendant's own animationend (e.g. a tile's tick-flash) bubbles
    // through the wrapper — must be IGNORED, not clear the pulse.
    page.fireDescendantAnimationEnd();
    expect(page.wrapperDrivenAttr()).toBe("true");

    // The wrapper's OWN animationend (target === currentTarget) DOES clear it.
    page.fireWrapperAnimationEnd();
    expect(page.wrapperDrivenAttr()).toBe("false");
  });
});

describe("useJarvisDrivenPulse — reduced-motion gate", () => {
  it("does NOT set pulsing while prefers-reduced-motion: reduce — the CSS never plays the animation, so animationend would never fire to clear a latched true", () => {
    // jsdom has no matchMedia at all (the hook optional-chains it), so stub
    // one on the window rather than spying — same idiom as
    // BootSequence.test.tsx's reduced-motion tests.
    const original = window.matchMedia;
    window.matchMedia = (() => {
      return { matches: true }; // prefers-reduced-motion: reduce
    }) as unknown as typeof window.matchMedia;

    try {
      const handle = page.mount(fakeViewModel(false));

      handle.rerenderWith(fakeViewModel(true));

      expect(page.wrapperDrivenAttr()).toBe("false");
    } finally {
      window.matchMedia = original;
    }
  });
});

function fakeViewModel(appliedBatch: boolean, isFreeze = false): ViewModel {
  return {
    useJarvisDriver: () => {
      return {
        lastBatch: appliedBatch
          ? [
              {
                command: { kind: "switchTab", tab: "equities" },
                status: "applied",
              },
            ]
          : [],
      };
    },
    usePowerSaver: () => {
      return { isFreeze };
    },
  } as unknown as ViewModel;
}
