import { afterEach, expect, test } from "@jest/globals";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { surfaceCardPage } from "#tests/pages/SurfaceCardPage";

const page = surfaceCardPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders a gradient sheen for variant=tile on a 3d skin", async () => {
  await page.mount("tile", "c", rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBeTruthy();
  expect(page.exists("c")).toBeTruthy();
});

test("renders no sheen for variant=panel even on a 3d skin", async () => {
  await page.mount("panel", "c", rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBe(false);
});

test("renders no sheen on a flat skin even for variant=tile", async () => {
  // renderWithTheme defaults to holo.dark (a flat skin, depth.level 0), but
  // pass it explicitly since this test's whole point is the flat case.
  await page.mount("tile", "c", rnThemeTokens.holo.dark);
  expect(page.exists("surface-sheen")).toBe(false);
});
