import { afterEach, describe, expect, it, vi } from "vitest";

import { dockTabStripsAreSettled } from "./dockResizeFlash";

/**
 * This package's vitest runs in the NODE environment — there is no DOM here, so
 * the predicate is driven against a stubbed `document.querySelectorAll`, the
 * same way `holdMotion.test.ts` drives the settling pass against stubbed
 * `document.getAnimations()` entries. What matters is the branch table, and in
 * particular the two readings that must NOT be conflated: a page whose dock has
 * settled, and a page whose dock has not mounted yet. Both have zero elements
 * carrying `dv-scrollable-resizing`; only the first is settled. A predicate that
 * answered "true" to the second would make the capture wait vacuous — the
 * failure mode this file exists to pin.
 *
 * The real browser semantics behind the class (that dockview adds
 * `dv-scrollable-resizing` per ResizeObserver tick and clears it 500 ms later,
 * and positions the thumb only after adding it) are witnessed by the pixel
 * tier itself: the `app/equities-instances-dockview`
 * goldens carry no scrollbar thumb in any skin, which is only reachable if this
 * predicate really gates the shutter.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dockTabStripsAreSettled", () => {
  it("is settled on a page with no dockview container at all", () => {
    // The in-house engine: no dockview chrome exists, so there is no flash to
    // wait out. Distinguished by the CONTAINER, not by the absence of a class.
    createStubPage({ docks: 0, strips: [] });

    expect(dockTabStripsAreSettled()).toBe(true);
  });

  it("is settled when every mounted tab strip is past its resize flash", () => {
    createStubPage({ docks: 1, strips: [MEASURED, MEASURED] });

    expect(dockTabStripsAreSettled()).toBe(true);
  });

  it("is NOT settled while a tab strip carries dockview's resizing class", () => {
    createStubPage({
      docks: 1,
      strips: [MEASURED, { ...MEASURED, classes: ["dv-scrollable-resizing"] }],
    });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("is NOT settled when the dock container is mounted but empty", () => {
    // The vacuity guard: zero strips means dockview has not laid out yet, which
    // reads identically to "settled" if you only look for the resizing class.
    createStubPage({ docks: 1, strips: [] });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("is NOT settled while a strip waits for dockview's first measurement", () => {
    // The per-strip vacuity guard: dockview adds the resizing class one frame
    // AFTER its ResizeObserver fires, so a strip that has never been measured
    // carries no class yet either. Its thumb has no inline position until the
    // first measurement, which is what tells "flash not begun" from "flash
    // over" (the 2026-10-24 terminal-light golden caught the thumb this way).
    createStubPage({ docks: 1, strips: [MEASURED, UNMEASURED] });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("counts a vertical strip as measured by its thumb's top", () => {
    createStubPage({
      docks: 1,
      strips: [{ classes: [], thumb: { left: "", top: "0px" } }],
    });

    expect(dockTabStripsAreSettled()).toBe(true);
  });

  it("is NOT settled when a strip has no thumb element to read", () => {
    // Fails closed: a dockview that dropped or renamed the thumb must time the
    // wait out loudly, not let every capture through unchecked.
    createStubPage({ docks: 1, strips: [{ classes: [], thumb: null }] });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("looks at every strip, not just the first", () => {
    createStubPage({
      docks: 1,
      strips: [
        MEASURED,
        MEASURED,
        { ...MEASURED, classes: ["dv-scrollable-resizing"] },
      ],
    });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("ignores dockview's other scrollable states, which no capture can reach", () => {
    // `:hover` and `dv-scrollable-scrolling` also paint the thumb, but neither
    // is reachable in a static capture — waiting on them would never settle.
    createStubPage({
      docks: 1,
      strips: [{ ...MEASURED, classes: ["dv-scrollable-scrolling"] }],
    });

    expect(dockTabStripsAreSettled()).toBe(true);
  });
});

interface FakePage {
  /** How many `.dockview-theme-rtc` containers the client rendered. */
  readonly docks: number;
  /** One entry per `.dv-scrollable`. */
  readonly strips: readonly FakeStripState[];
}

interface FakeStripState {
  /** The strip's own class names. */
  readonly classes: readonly string[];
  /** Its `.dv-scrollbar`'s inline position, or null when it has none. */
  readonly thumb: { readonly left: string; readonly top: string } | null;
}

/** A strip dockview has measured: horizontal, nothing overflowing. */
const MEASURED: FakeStripState = {
  classes: [],
  thumb: { left: "0px", top: "" },
};

/** A strip whose first ResizeObserver tick dockview has not handled yet. */
const UNMEASURED: FakeStripState = {
  classes: [],
  thumb: { left: "", top: "" },
};

/** The members of a `.dv-scrollable` the predicate reaches for. */
interface FakeStrip {
  readonly classList: DOMTokenList;
  readonly querySelector: (selector: string) => unknown;
}

function createStubPage(page: FakePage): void {
  const strips = page.strips.map((state): FakeStrip => {
    return {
      classList: {
        contains: (name: string): boolean => {
          return state.classes.includes(name);
        },
      } as DOMTokenList,
      querySelector: (selector: string): unknown => {
        if (selector !== ".dv-scrollbar") {
          throw new Error(`unexpected strip selector "${selector}"`);
        }

        return state.thumb === null ? null : { style: state.thumb };
      },
    };
  });

  vi.stubGlobal("document", {
    querySelectorAll: (selector: string): readonly unknown[] => {
      if (selector === ".dockview-theme-rtc") {
        return Array.from({ length: page.docks }, (): object => {
          return {};
        });
      }

      if (selector === ".dv-scrollable") {
        return strips;
      }

      throw new Error(`unexpected selector "${selector}"`);
    },
  });
}
