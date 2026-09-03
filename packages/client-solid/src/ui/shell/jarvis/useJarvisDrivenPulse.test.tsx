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
import type { JSX } from "solid-js";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import type { DriveOutcome, JarvisDriverState } from "@rtc/client-core";
import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { jarvisDrivenPulsePage } from "#tests/ui/pages/UseJarvisDrivenPulsePage";

import { useJarvisDrivenPulse } from "./useJarvisDrivenPulse";

const page = jarvisDrivenPulsePage();

afterEach(() => {
  page.unmountAll();
});

describe("useJarvisDrivenPulse — descendant animationend guard", () => {
  it("a descendant's bubbling animationend does NOT clear the pulse; the wrapper's OWN animationend does", () => {
    // Both declared inside the test (mirrors useLiveMetrics.test.tsx's
    // Wrapper-inside-it() idiom, and client-react's own
    // useJarvisDrivenPulse.test.tsx precedent for the underlying rule pair
    // this dodges — biome's useComponentExportOnlyModules/noExportsInTest
    // forbid a top-level, non-exported JSX-returning function in a test
    // file). TWO named components, not one inlined into `render`'s own
    // callback: eslint-plugin-solid's reactivity check mis-reads an
    // anonymous `render(() => (<Provider value={fakeViewModel(...)}>...))`
    // arrow as an untracked "unnamed derived signal" once its JSX closes
    // over a locally-declared component — wrapping the whole tree in a
    // second named (PascalCase) component silences the false positive by
    // giving the plugin a real component boundary to recognize.
    function Harness(): JSX.Element {
      const pulse = useJarvisDrivenPulse();

      return (
        <div
          data-testid="wrapper"
          ref={pulse.ref}
          data-jarvis-driven={pulse.pulsing() ? "true" : "false"}
        >
          <div data-testid="descendant" />
        </div>
      );
    }

    const [batch, setBatch] = createSignal<readonly DriveOutcome[]>([]);

    function TestApp(): JSX.Element {
      return (
        <ViewModelContext.Provider value={fakeViewModel(batch, false)}>
          <Harness />
        </ViewModelContext.Provider>
      );
    }

    page.mount(() => {
      return <TestApp />;
    });

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
    // Declared inside the test — see the sibling describe block's Harness/
    // TestApp pair for why there are two, not one.
    function Harness(): JSX.Element {
      const pulse = useJarvisDrivenPulse();

      return (
        <div
          data-testid="wrapper"
          ref={pulse.ref}
          data-jarvis-driven={pulse.pulsing() ? "true" : "false"}
        >
          <div data-testid="descendant" />
        </div>
      );
    }

    const [batch, setBatch] = createSignal<readonly DriveOutcome[]>([]);

    function TestApp(): JSX.Element {
      return (
        <ViewModelContext.Provider value={fakeViewModel(batch, false)}>
          <Harness />
        </ViewModelContext.Provider>
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
      page.mount(() => {
        return <TestApp />;
      });

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

function fakeViewModel(
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
