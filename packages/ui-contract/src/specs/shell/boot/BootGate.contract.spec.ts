import { BootGate } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    createStubReducedMotion(true);
    // Explicit non-default seed: forceBootAnimation now defaults to true
    // (DEFAULT_FORCE_BOOT_ANIMATION), which would override reduced-motion and
    // send dismissal down the fade path this case exists to rule out.
    const page = mount(BootGate, { forceBootAnimation: false });
    await page.skip();
    expect(page.hasSplash()).toBe(false);
    expect(page.hasContent()).toBe(true);
  });

  it("unmounts the splash immediately under power-saver Freeze (no transitionend)", async () => {
    // Freeze's catch-all sets `transition-property: none`, so the opacity
    // transitionend BootGate normally waits on never fires — without the
    // direct dismiss in handleDone the splash would overlay the app forever.
    const page = mount(BootGate, { powerSaverLevel: "freeze" });
    await page.skip();
    expect(page.hasSplash()).toBe(false);
    expect(page.hasContent()).toBe(true);
  });

  it("unmounts the splash under a Freeze that arrives after the splash mounted", async () => {
    // A stored preference reaches the UI after the first render. A done
    // handler that kept the first render's "not frozen" would wait for a
    // transitionend Freeze has switched off, and the splash would stay
    // mounted, invisible, for the life of the page.
    const page = mount(BootGate, {});
    page.freezeArrives();
    await page.skip();
    expect(page.hasSplash()).toBe(false);
    expect(page.hasContent()).toBe(true);
  });

  it("unmounts the splash under a Freeze that arrives while it is fading", async () => {
    // The sequence is done and the gate is waiting for the fade to end.
    // Freeze switches the transition off, so that end never comes: the gate
    // has to act on the Freeze itself.
    const page = mount(BootGate, {});
    await page.skip();
    expect(page.hasSplash()).toBe(true);

    page.freezeArrives();
    expect(page.hasSplash()).toBe(false);
    expect(page.hasContent()).toBe(true);
  });

  it("under Freeze, a rebooted splash plays again and is dismissed when it is done", async () => {
    const page = mount(BootGate, { powerSaverLevel: "freeze" });
    await page.skip();
    expect(page.hasSplash()).toBe(false);

    // The first splash being done must not count for the second one: it is
    // neither dismissed on sight nor left mounted once it finishes.
    page.reboot();
    expect(page.hasSplash()).toBe(true);
    await page.skip();
    expect(page.hasSplash()).toBe(false);
  });

  it("re-raises the splash when the seam reboots after a dismissal", async () => {
    const page = mount(BootGate, {});
    await page.skip();
    page.endFade();
    expect(page.hasSplash()).toBe(false);

    page.reboot();
    expect(page.hasSplash()).toBe(true);
    expect(page.hasContent()).toBe(true);
  });

  it("stays hidden when the seam seeds the splash invisible (webdriver/nosplash)", () => {
    const page = mount(BootGate, {});
    page.hideThroughSeam();
    expect(page.hasSplash()).toBe(false);
    expect(page.hasContent()).toBe(true);
  });
});

/** Install a window.matchMedia stub for one test (jsdom omits it). */
function createStubReducedMotion(matches: boolean): void {
  function createFakeMatchMedia(query: string): MediaQueryList {
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

  vi.stubGlobal("matchMedia", createFakeMatchMedia);
}
