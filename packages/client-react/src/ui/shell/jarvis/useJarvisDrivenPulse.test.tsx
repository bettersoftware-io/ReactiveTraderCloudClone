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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { useJarvisDrivenPulse } from "./useJarvisDrivenPulse";

afterEach(() => {
  cleanup();
});

describe("useJarvisDrivenPulse — descendant animationend guard", () => {
  it("a descendant's bubbling animationend does NOT clear the pulse; the wrapper's OWN animationend does", () => {
    // Declared inside the test (mirrors useLiveMetrics.test.tsx's
    // Wrapper-inside-it() idiom) rather than at module top level: a
    // top-level JSX-returning function here would trip biome's
    // useComponentExportOnlyModules (wants it exported) AND
    // noExportsInTest (forbids exporting from a test file) at once.
    function Harness(): ReactElement {
      const { pulsing, clearPulse } = useJarvisDrivenPulse();

      return (
        <div
          data-testid="wrapper"
          data-jarvis-driven={pulsing ? "true" : "false"}
          onAnimationEnd={clearPulse}
        >
          <div data-testid="descendant" />
        </div>
      );
    }

    const { rerender } = render(
      <ViewModelContext.Provider value={fakeViewModel(false)}>
        <Harness />
      </ViewModelContext.Provider>,
    );

    // A new applied outcome arrives — pulsing turns true.
    rerender(
      <ViewModelContext.Provider value={fakeViewModel(true)}>
        <Harness />
      </ViewModelContext.Provider>,
    );

    const wrapper = screen.getByTestId("wrapper");
    expect(wrapper.getAttribute("data-jarvis-driven")).toBe("true");

    // A descendant's own animationend (e.g. a tile's tick-flash) bubbles
    // through the wrapper — must be IGNORED, not clear the pulse.
    webkitAnimationEnd(screen.getByTestId("descendant"));
    expect(wrapper.getAttribute("data-jarvis-driven")).toBe("true");

    // The wrapper's OWN animationend (target === currentTarget) DOES clear it.
    webkitAnimationEnd(wrapper);
    expect(wrapper.getAttribute("data-jarvis-driven")).toBe("false");
  });
});

describe("useJarvisDrivenPulse — reduced-motion gate", () => {
  it("does NOT set pulsing while prefers-reduced-motion: reduce — the CSS never plays the animation, so animationend would never fire to clear a latched true", () => {
    function Harness(): ReactElement {
      const { pulsing, clearPulse } = useJarvisDrivenPulse();

      return (
        <div
          data-testid="wrapper"
          data-jarvis-driven={pulsing ? "true" : "false"}
          onAnimationEnd={clearPulse}
        >
          <div data-testid="descendant" />
        </div>
      );
    }

    // jsdom has no matchMedia at all (the hook optional-chains it), so stub
    // one on the window rather than spying — same idiom as
    // BootSequence.test.tsx's reduced-motion tests.
    const original = window.matchMedia;
    window.matchMedia = (() => {
      return { matches: true }; // prefers-reduced-motion: reduce
    }) as unknown as typeof window.matchMedia;

    try {
      const { rerender } = render(
        <ViewModelContext.Provider value={fakeViewModel(false)}>
          <Harness />
        </ViewModelContext.Provider>,
      );

      rerender(
        <ViewModelContext.Provider value={fakeViewModel(true)}>
          <Harness />
        </ViewModelContext.Provider>,
      );

      expect(
        screen.getByTestId("wrapper").getAttribute("data-jarvis-driven"),
      ).toBe("false");
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

function webkitAnimationEnd(el: Element): void {
  fireEvent(
    el,
    new Event("webkitAnimationEnd", { bubbles: true, cancelable: false }),
  );
}
