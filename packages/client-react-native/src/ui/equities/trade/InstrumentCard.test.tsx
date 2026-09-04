import { afterEach, expect, jest, test } from "@jest/globals";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { instrumentCardPage } from "#tests/pages/InstrumentCardPage";

const page = instrumentCardPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders symbol, name · exchange, price and signed pct in one card, with the chart inside", async () => {
  await page.mount("NVDA");
  expect(page.exists("instrument-card")).toBe(true);
  expect(page.hasText("NVDA")).toBe(true);
  expect(page.hasText("NVIDIA Corp · NASDAQ")).toBe(true);
  expect(page.hasText("131.14")).toBe(true);
  expect(page.hasText("-0.94%")).toBe(true);
  expect(page.exists("eq-candle-empty")).toBe(true);
});

test("price and pct take the change colour", async () => {
  const t = rnThemeTokens.holo.dark;
  await page.mount("NVDA");
  expect(page.styleOfText("131.14")).toMatchObject({
    color: t.accentNegative,
  });
  expect(page.styleOfText("-0.94%")).toMatchObject({
    color: t.accentNegative,
  });
});

test("the separator is a real middle dot, not an escape sequence", async () => {
  await page.mount("NVDA");
  expect(page.hasTextMatching(/\\u00B7/i)).toBe(false);
  expect(page.hasTextMatching(/·/)).toBe(true);
});

// dc.html:363 — the instrument tile is a `--tile-bg` / `--tile-shadow`
// surface (SurfaceCard's tile variant), so 3d skins paint the tile gradient.
test("renders the gradient tile surface on 3d skins", async () => {
  await page.mount("NVDA", rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBe(true);
});

test("flat skins render no gradient tile surface", async () => {
  // page.mount defaults to holo.dark (flat, `tileGradient: null`).
  await page.mount("NVDA");
  expect(page.exists("surface-sheen")).toBe(false);
});

// `vm()` only stubs the two hooks this component reads off the ViewModel
// (useWatchlist/useEquityQuote); useShellMotionEnabled reads `usePowerSaver`
// off the same ViewModel context, so it's mocked directly here rather than
// widening `vm()` — mirrors SpotTile.test.tsx, the other useTickFlash
// consumer.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
