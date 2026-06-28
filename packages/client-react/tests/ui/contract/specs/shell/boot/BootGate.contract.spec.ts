import { BootGate } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Install a window.matchMedia stub for one test (jsdom omits it). */
function stubReducedMotion(matches: boolean): void {
  function fakeMatchMedia(query: string): MediaQueryList {
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => {
        return false;
      },
    } as MediaQueryList;
  }

  vi.stubGlobal("matchMedia", fakeMatchMedia);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BootGate", () => {
  it("renders the app content beneath the boot splash while booting", () => {
    const page = mount(BootGate, {});
    expect(page.hasContent()).toBe(true);
    expect(page.hasSplash()).toBe(true);
  });

  it("fades the splash out and unmounts it once its opacity transition ends", async () => {
    const page = mount(BootGate, {});
    await page.skip();
    // The sequence is done (splash now fading) but still mounted until its
    // opacity transition completes — content stays mounted throughout.
    expect(page.splashDone()).toBe(true);
    expect(page.hasSplash()).toBe(true);
    expect(page.hasContent()).toBe(true);

    page.endFade();
    expect(page.hasSplash()).toBe(false);
    expect(page.hasContent()).toBe(true);
  });

  it("ignores non-opacity transitions while fading", async () => {
    const page = mount(BootGate, {});
    await page.skip();
    page.endUnrelatedTransition();
    expect(page.hasSplash()).toBe(true);
  });

  it("unmounts the splash immediately under reduced motion (no fade)", async () => {
    stubReducedMotion(true);
    const page = mount(BootGate, {});
    await page.skip();
    expect(page.hasSplash()).toBe(false);
    expect(page.hasContent()).toBe(true);
  });
});
