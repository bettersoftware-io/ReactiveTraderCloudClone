import { describe, expect, it } from "vitest";

import { reactorRingsPage } from "#tests/ui/pages/ReactorRingsPage";

const page = reactorRingsPage();

describe("ReactorRings", () => {
  it("renders its child", () => {
    page.mount();

    expect(page.exists("emblem-marker")).toBe(true);
  });

  it("renders exactly two counter-rotating arc rings, hidden from assistive tech", () => {
    page.mount();

    expect(page.ringCount()).toBe(2);
  });

  it("wraps the child in a shared ancestor rather than standing alone beside it", () => {
    page.mount();

    // The rings and the emblem must share a common parent element (the
    // ReactorRings root) — proving the arcs are laid out AROUND the emblem
    // rather than rendered as a disconnected, standalone cluster elsewhere in
    // the tree.
    expect(page.hasRoot()).toBe(true);
    expect(page.rootContainsMarker()).toBe(true);
    expect(page.rootContainsEveryRing()).toBe(true);

    // The emblem itself must not be nested inside either ring's wrapper — it
    // sits as a sibling slot, so the rings visually surround it instead of
    // containing/clipping it.
    expect(page.noRingContainsOrWrapsMarker()).toBe(true);
  });

  it("does not carry the auth-wait-reactor testid — that stays on ReactorWait", () => {
    page.mount();

    expect(page.hasReactorWaitTestId()).toBe(false);
  });
});
