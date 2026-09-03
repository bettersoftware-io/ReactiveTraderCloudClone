import { expect, test } from "@jest/globals";

import { rankMoveGlidePage } from "#tests/pages/UseRankMoveGlidePage";

const RISE_COLOR = "#2bffb3";
const FALL_COLOR = "#ff5d73";

test("tints the overlay by direction — rise green, fall red, never the other way", async () => {
  const page = rankMoveGlidePage();
  await page.mount(2, RISE_COLOR, FALL_COLOR, true);
  // First render: no PREVIOUS rank recorded yet, so no pulse plays — the
  // shared value starts at its seed colour rather than either real one.
  expect(page.overlayBackground()).toBe(RISE_COLOR);

  // rank improves 2 → 1 (a numerically LOWER rank, up the board): "rose".
  await page.advance(1, true);
  expect(page.overlayBackground()).toBe(RISE_COLOR);

  // rank worsens 1 → 3 (a numerically HIGHER rank, down the board): "fell".
  // This is the assertion that catches the bug where every direction change
  // was misclassified "rose" (computeRankDirections's array-index semantics
  // don't apply to a single row) — it is red against that code and green
  // against directionFor's direct numeric comparison.
  await page.advance(3, true);
  expect(page.overlayBackground()).toBe(FALL_COLOR);

  // rank improves again 3 → 1: back to "rose".
  await page.advance(1, true);
  expect(page.overlayBackground()).toBe(RISE_COLOR);

  // motion gated off: any in-flight pulse is cancelled, opacity held at 0,
  // no crash — the tint itself is irrelevant once invisible.
  await page.advance(2, false);
  expect(page.overlayOpacity()).toBe(0);

  await page.unmountAll();
});
