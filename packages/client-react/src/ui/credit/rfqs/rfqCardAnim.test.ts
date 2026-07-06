import { describe, expect, it } from "vitest";

import {
  cardAnim,
  enterCascadeAdditions,
  STAGGER_STEP_MS,
} from "./rfqCardAnim";

describe("enterCascadeAdditions", () => {
  it("returns an empty map when nothing is new and the filter didn't change", () => {
    const additions = enterCascadeAdditions({
      prevShownIds: new Set([1, 2, 3]),
      shownIds: [1, 2, 3],
      filterChanged: false,
    });
    expect(additions.size).toBe(0);
  });

  it("gives a brand-new id a 0ms delay", () => {
    const additions = enterCascadeAdditions({
      prevShownIds: new Set([1, 2]),
      shownIds: [1, 2, 3],
      filterChanged: false,
    });
    expect(additions.get(3)).toBe(0);
    expect(additions.has(1)).toBe(false);
    expect(additions.has(2)).toBe(false);
  });

  it("staggers every surviving id by its grid index when the filter changed", () => {
    const additions = enterCascadeAdditions({
      prevShownIds: new Set([1, 2, 3]),
      shownIds: [1, 2, 3],
      filterChanged: true,
    });
    expect(additions.get(1)).toBe(0 * STAGGER_STEP_MS);
    expect(additions.get(2)).toBe(1 * STAGGER_STEP_MS);
    expect(additions.get(3)).toBe(2 * STAGGER_STEP_MS);
  });

  it("gives a new id 0ms even during a filter-change cascade, not the stagger delay", () => {
    const additions = enterCascadeAdditions({
      prevShownIds: new Set([1]),
      shownIds: [1, 2],
      filterChanged: true,
    });
    expect(additions.get(1)).toBe(0);
    expect(additions.get(2)).toBe(0);
  });

  it("does not add ids that neither are new nor part of a filter change", () => {
    const additions = enterCascadeAdditions({
      prevShownIds: new Set([1, 2]),
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
