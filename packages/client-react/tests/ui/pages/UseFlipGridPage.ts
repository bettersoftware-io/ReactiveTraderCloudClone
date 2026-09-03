// The framework surface for `useFlipGrid.test.ts`: the spec builds its own
// element/rect fixtures and drives the hook purely through renderHook's own
// return value, so this page owns only the render mechanic plus the one raw
// DOM query the spec needs against its own fixture element (not a rendered
// tree) — the sanctioned "spec-side harness composition" placement.
export { renderHook } from "@testing-library/react";

/** How many `[data-testid]` descendants `el` has — the ghost-tile teardown
 * test's proof that the fading clone is stripped of every test id so e2e
 * tile counts don't see it mid-fade. */
export function testIdDescendantCount(el: Element): number {
  return el.querySelectorAll("[data-testid]").length;
}
