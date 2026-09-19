/**
 * Solid counterpart of client-react's useJarvisDrivenPulse.test.tsx —
 * regression witness for the same two Task 10 review round-1 findings,
 * replicated here per the Task 11 brief: the descendant-bubbling guard and
 * the reduced-motion gate.
 *
 * Unlike the react version, this hook exposes a `ref` callback rather than a
 * JSX `onAnimationEnd` prop — see useJarvisDrivenPulse.ts's own doc for why
 * (Solid's JSX `onAnimationEnd` binding only ever listens for the unprefixed
 * "animationend" name, and this repo's jsdom has no `window.AnimationEvent`
 * at all, so RfqCard.tsx's native-listener precedent is followed instead).
 * This file fires `webkitAnimationEnd` (the same name RfqsPanelPage.ts's
 * documented jsdom quirk uses for the react side), not the unprefixed
 * `animationend`, to match what the hook actually subscribes to.
 */
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import type { DriveOutcome, JarvisDriverState } from "@rtc/client-core";
import type { ViewModel } from "@rtc/solid-bindings";

import { jarvisDrivenPulsePage } from "#tests/ui/pages/UseJarvisDrivenPulsePage";

afterEach(() => {
  page.unmountAll();
});

describe("useJarvisDrivenPulse — descendant animationend guard", () => {
  it("a descendant's bubbling animationend does NOT clear the pulse; the wrapper's OWN animationend does", () => {
    const [batch, setBatch] = createSignal<readonly DriveOutcome[]>([]);

    page.mount({ viewModel: createFakeViewModel(batch, false) });

    // A new applied outcome arrives — pulsing turns true.
    setBatch([
      { command: { kind: "switchTab", tab: "equities" }, status: "applied" },
    ]);

    expect(page.wrapperDrivenAttr("wrapper")).toBe("true");

    // A descendant's own animationend (e.g. a tile's tick-flash) bubbles
    // through the wrapper — must be IGNORED, not clear the pulse.
    page.fireAnimationEnd("descendant");
    expect(page.wrapperDrivenAttr("wrapper")).toBe("true");

    // The wrapper's OWN animationend (target === currentTarget) DOES clear it.
    page.fireAnimationEnd("wrapper");
    expect(page.wrapperDrivenAttr("wrapper")).toBe("false");
  });
});

describe("useJarvisDrivenPulse — reduced-motion gate", () => {
  it("does NOT set pulsing while prefers-reduced-motion: reduce — the CSS never plays the animation, so animationend would never fire to clear a latched true", () => {
    const [batch, setBatch] = createSignal<readonly DriveOutcome[]>([]);

    // jsdom has no matchMedia at all (the hook optional-chains it), so stub
    // one on the window rather than spying — same idiom as
    // BootSequence.test.tsx's reduced-motion tests.
    const original = window.matchMedia;
    window.matchMedia = (() => {
      return { matches: true }; // prefers-reduced-motion: reduce
    }) as unknown as typeof window.matchMedia;

    try {
      page.mount({ viewModel: createFakeViewModel(batch, false) });

      setBatch([
        {
          command: { kind: "switchTab", tab: "equities" },
          status: "applied",
        },
      ]);

      expect(page.wrapperDrivenAttr("wrapper")).toBe("false");
    } finally {
      window.matchMedia = original;
    }
  });
});

function createFakeViewModel(
  batch: () => readonly DriveOutcome[],
  isFreeze: boolean,
): ViewModel {
  return {
    useJarvisDriver: () => {
      return (): JarvisDriverState => {
        return { lastBatch: batch() };
      };
    },
    usePowerSaver: () => {
      return {
        isFreeze: () => {
          return isFreeze;
        },
      };
    },
  } as unknown as ViewModel;
}

const page = jarvisDrivenPulsePage();
