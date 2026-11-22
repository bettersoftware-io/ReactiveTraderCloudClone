import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { rankGlidePage } from "#tests/ui/pages/UseRankGlidePage";

import { rowHeight } from "./useRankGlide";

afterEach(() => {
  page.unmountAll();
});

// The watchlist's first real re-sort lands just after mount (each row reports
// its quote from an effect, and the sort re-ranks on it). React's layout
// effect records the mount order and glides that re-sort; so must this hook.
// Under Solid 2 the glide effect's compute runs in the component body, before
// the list's ref is assigned: a root read THERE recorded no ranks on mount,
// and the re-sort glided nothing — rows the pixel tier then captured without
// the glide/highlight pass React's reference goldens went through.
describe("useRankGlide", () => {
  it("records the first committed order without gliding", () => {
    const glided = page.mount(() => {
      return ["AAA", "BBB", "CCC"];
    });

    expect(glided).toEqual([]);
  });

  it("glides the rows a re-sort right after mount moved, from their mount ranks", () => {
    const [candidate, setCandidate] = createSignal<readonly string[]>([
      "AAA",
      "BBB",
      "CCC",
    ]);
    const glided = page.mount(candidate);

    setCandidate(["CCC", "AAA", "BBB"]);
    flush();

    expect([...glided].sort()).toEqual(["AAA", "BBB", "CCC"]);
  });
});

describe("rowHeight", () => {
  it("falls back to FALLBACK_ROW_HEIGHT with fewer than two rows — there's no gap to measure", () => {
    expect(rowHeight([])).toBe(52);
    expect(rowHeight([stubbedRow(0)])).toBe(52);
  });

  it("measures the gap between the first two rows' tops", () => {
    expect(rowHeight([stubbedRow(10), stubbedRow(60)])).toBe(50);
  });

  it("falls back to FALLBACK_ROW_HEIGHT when the measured gap is zero", () => {
    // Same top for both — e.g. rows haven't been laid out yet (0-height
    // container) — a zero/falsy delta must not glide by 0px forever.
    expect(rowHeight([stubbedRow(0), stubbedRow(0)])).toBe(52);
  });

  function stubbedRow(top: number): HTMLElement {
    const el = document.createElement("div");

    el.getBoundingClientRect = (): DOMRect => {
      return { top } as DOMRect;
    };

    return el;
  }
});

const page = rankGlidePage();
