import { afterEach, expect, test } from "@jest/globals";

import { appearanceOverlayPage } from "#tests/pages/AppearanceOverlayPage";

// `@gorhom/bottom-sheet` is replaced package-wide by the manual mock at
// `__mocks__/@gorhom/bottom-sheet.tsx` (picked up automatically by jest, no
// `jest.mock` call needed here). That double gates its `children` behind the
// imperative `.present()`/`.dismiss()` handle rather than always rendering
// them, matching the real component's own `mount` contract — so
// `page.exists("appearance-sheet")` below is proof `.present()` was actually
// invoked, not just that the tree contains a `BottomSheetView`.

const page = appearanceOverlayPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the sheet with a grab handle and no CLOSE affordance", async () => {
  await page.mount(true);
  expect(page.exists("appearance-sheet")).toBe(true);
  expect(page.exists("appearance-close")).toBe(false);
});

test("renders nothing when closed", async () => {
  await page.mount(false);
  expect(page.exists("appearance-sheet")).toBe(false);
});

// Guards the effect-deps bug found in review: an empty-deps mount effect
// only ever calls `.present()` once, at `AppearanceOverlay`'s own mount —
// almost always while still closed, since it stays mounted for the app's
// whole lifetime and only `open` toggles. First-mount-already-open (the test
// above) can't catch that; only a later false -> true transition on an
// already-mounted instance can.
test("presents the sheet on a later open, not just at first mount", async () => {
  // `mountBare`/`rerenderOpen` reapply the same `ThemeContext.Provider` +
  // `ViewModelProvider` wrapper by hand on each render, matching what
  // `renderWithTheme` does internally (`rnThemeTokens.holo.dark`, its own
  // default) — `rerender` replaces the whole previous tree, so a wrapper
  // reused only implicitly on mount must be reapplied explicitly here.
  await page.mountBare(false);
  expect(page.exists("appearance-sheet")).toBe(false);

  await page.rerenderOpen(true);
  expect(page.exists("appearance-sheet")).toBe(true);
});
