import { describe, expect, it } from "vitest";

import {
  cardAnim,
  enterCascadeAdditions,
  STAGGER_STEP_MS,
} from "./rfqCardAnim";

describe("enterCascadeAdditions", () => {
  it("returns an empty map when nothing was created and the filter didn't change", () => {
    const additions = enterCascadeAdditions({
      prevAllIds: new Set([1, 2, 3]),
      shownIds: [1, 2, 3],
      filterChanged: false,
    });
    expect(additions.size).toBe(0);
  });

  it("gives a genuinely just-created id a 0ms delay", () => {
    const additions = enterCascadeAdditions({
      prevAllIds: new Set([1, 2]),
      shownIds: [3, 1, 2],
      filterChanged: false,
    });
    expect(additions.get(3)).toBe(0);
    expect(additions.has(1)).toBe(false);
    expect(additions.has(2)).toBe(false);
  });

  // PROTO cardDelayMs/isTabRecent: a filter switch staggers EVERY shown card
  // by its grid index — including cards the new filter reveals for the first
  // time (a disjoint live→closed switch shows an entirely different id set,
  // and they all cascade; none of them get the new-RFQ 0ms fast path because
  // none of them were just CREATED — they already existed unfiltered).
  it("staggers every shown id by its grid index when the filter changed", () => {
    const additions = enterCascadeAdditions({
      prevAllIds: new Set([1, 2, 3]),
      shownIds: [3, 2],
      filterChanged: true,
    });
    expect(additions.get(3)).toBe(0 * STAGGER_STEP_MS);
    expect(additions.get(2)).toBe(1 * STAGGER_STEP_MS);
  });

  it("keeps the 0ms fast path for a just-created id even during a filter-change cascade", () => {
    const additions = enterCascadeAdditions({
      prevAllIds: new Set([1]),
      shownIds: [1, 2],
      filterChanged: true,
    });
    // id 1 already existed → staggers by index; id 2 was just created → 0ms
    // (PROTO cardDelayMs: isNew wins over the tab-recent stagger).
    expect(additions.get(1)).toBe(0 * STAGGER_STEP_MS);
    expect(additions.get(2)).toBe(0);
  });

  it("staggers filter-revealed ids that already existed, at their grid index", () => {
    const additions = enterCascadeAdditions({
      prevAllIds: new Set([1, 2, 3]),
      shownIds: [1, 2, 3],
      filterChanged: true,
    });
    expect(additions.get(1)).toBe(0 * STAGGER_STEP_MS);
    expect(additions.get(2)).toBe(1 * STAGGER_STEP_MS);
    expect(additions.get(3)).toBe(2 * STAGGER_STEP_MS);
  });

  // PROTO: a card revealed by a STATE TRANSITION while viewing another tab
  // (e.g. Open→Expired seen from CLOSED) appears plain — no entrance. Only
  // creation (newRfqId) or a filter switch (tabRecent) animate an entrance.
  it("does not animate an id revealed by a state change (existed unfiltered before, no filter change)", () => {
    const additions = enterCascadeAdditions({
      prevAllIds: new Set([1, 2]),
      shownIds: [1, 2],
      filterChanged: false,
    });
    expect(additions.size).toBe(0);
  });
});

describe("cardAnim", () => {
  it("prefers exit over an in-flight entrance", () => {
    expect(cardAnim(true, true)).toBe("exit");
  });

  it("reports enter when only entering", () => {
    expect(cardAnim(false, true)).toBe("enter");
  });

  it("reports exit when only exiting", () => {
    expect(cardAnim(true, false)).toBe("exit");
  });

  it("reports none when neither", () => {
    expect(cardAnim(false, false)).toBe("none");
  });
});
