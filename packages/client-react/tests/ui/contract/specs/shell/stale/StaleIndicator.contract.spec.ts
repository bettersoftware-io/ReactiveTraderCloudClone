import { StaleIndicator } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  return cleanupMounted();
});

describe("StaleIndicator", () => {
  it("renders children without an overlay when fresh", () => {
    const ind = mount(StaleIndicator, {
      props: { stale: false, childLabel: "live data" },
    });
    expect(ind.showsChild("live data")).toBe(true);
    expect(ind.isStale()).toBe(false);
    expect(ind.hasOverlay()).toBe(false);
  });

  it("greys out the children with a reconnect overlay when stale", () => {
    const ind = mount(StaleIndicator, {
      props: { stale: true, childLabel: "live data" },
    });
    expect(ind.showsChild("live data")).toBe(true);
    expect(ind.isStale()).toBe(true);
    expect(ind.hasOverlay()).toBe(true);
  });

  it("toggles the overlay when the stale prop flips", () => {
    const ind = mount(StaleIndicator, {
      props: { stale: false, childLabel: "live data" },
    });
    expect(ind.hasOverlay()).toBe(false);
    ind.setProps({ stale: true });
    expect(ind.hasOverlay()).toBe(true);
    expect(ind.isStale()).toBe(true);
    ind.setProps({ stale: false });
    expect(ind.hasOverlay()).toBe(false);
    expect(ind.isStale()).toBe(false);
  });
});
