import { AmbientBackground } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("AmbientBackground", () => {
  it("renders a calm (data-animated=false) decorative backdrop when the preference is off", () => {
    const page = mount(AmbientBackground, { animatedBackground: false });
    expect(page.hasRoot()).toBe(true);
    expect(page.animatedFlag()).toBe("false");
  });

  it("flags the backdrop animated (data-animated=true) when the preference is on", () => {
    const page = mount(AmbientBackground, { animatedBackground: true });
    expect(page.hasRoot()).toBe(true);
    expect(page.animatedFlag()).toBe("true");
  });

  it("is aria-hidden so the decorative backdrop is invisible to assistive tech", () => {
    const page = mount(AmbientBackground, { animatedBackground: true });
    expect(page.ariaHidden()).toBe("true");
  });
});
