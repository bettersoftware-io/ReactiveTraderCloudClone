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
 * `dv-scrollable-resizing` per ResizeObserver tick and clears it 500 ms later)
 * are witnessed by the pixel tier itself: the `app/equities-instances-dockview`
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
    createStubPage({ docks: 1, strips: [[], []] });

    expect(dockTabStripsAreSettled()).toBe(true);
  });

  it("is NOT settled while a tab strip carries dockview's resizing class", () => {
    createStubPage({ docks: 1, strips: [[], ["dv-scrollable-resizing"]] });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("is NOT settled when the dock container is mounted but empty", () => {
    // The vacuity guard: zero strips means dockview has not laid out yet, which
    // reads identically to "settled" if you only look for the resizing class.
    createStubPage({ docks: 1, strips: [] });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("looks at every strip, not just the first", () => {
    createStubPage({ docks: 1, strips: [[], [], ["dv-scrollable-resizing"]] });

    expect(dockTabStripsAreSettled()).toBe(false);
  });

  it("ignores dockview's other scrollable states, which no capture can reach", () => {
    // `:hover` and `dv-scrollable-scrolling` also paint the thumb, but neither
    // is reachable in a static capture — waiting on them would never settle.
    createStubPage({ docks: 1, strips: [["dv-scrollable-scrolling"]] });

    expect(dockTabStripsAreSettled()).toBe(true);
  });
});

interface FakePage {
  /** How many `.dockview-theme-rtc` containers the client rendered. */
  readonly docks: number;
  /** One entry per `.dv-scrollable`, holding that strip's class names. */
  readonly strips: readonly (readonly string[])[];
}

/** The one member of a `.dv-scrollable` the predicate reaches for. */
interface FakeStrip {
  readonly classList: DOMTokenList;
}

function createStubPage(page: FakePage): void {
  const strips = page.strips.map((classes): FakeStrip => {
    return {
      classList: {
        contains: (name: string): boolean => {
          return classes.includes(name);
        },
      } as DOMTokenList,
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
