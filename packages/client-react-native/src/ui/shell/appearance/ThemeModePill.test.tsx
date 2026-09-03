import { afterEach, expect, jest, test } from "@jest/globals";

import { rnThemeTokens } from "#/ui/theme/tokens";
import {
  type ThemeMode,
  themeModePillPage,
} from "#tests/pages/ThemeModePillPage";

const page = themeModePillPage();

afterEach(() => {
  return page.unmountAll();
});

// THREE cells, not the design's two: `system` is this app's own preference,
// and a regression to a 2-way pill would leave it unreachable from the sheet
// with every press test below still green.
test("renders all three mode cells with the design's glyph labels", async () => {
  await page.mount("dark", () => {});
  expect(page.hasCellLabel("☾ DARK")).toBe(true);
  expect(page.hasCellLabel("☀ LIGHT")).toBe(true);
  expect(page.hasCellLabel("AUTO")).toBe(true);
});

test.each<[ThemeMode]>([["dark"], ["light"], ["system"]])(
  "pressing the %s cell reports that cell",
  async (target) => {
    const onSelect = jest.fn();
    await page.mount("dark", onSelect);
    await page.pressCell(target);
    expect(onSelect).toHaveBeenCalledWith(target);
  },
);

// The pill reports every press, including one on the already-active cell —
// the cycle arithmetic that turns "already there" into zero steps lives in
// `cyclesToReach`, not here, so swallowing it would hide that seam.
test("pressing the active cell still reports it", async () => {
  const onSelect = jest.fn();
  await page.mount("light", onSelect);
  await page.pressCell("light");
  expect(onSelect).toHaveBeenCalledWith("light");
});

test("the active cell is filled with the accent and lettered on-accent", async () => {
  const t = rnThemeTokens.holo.dark;
  await page.mount("light", () => {});
  const active = page.cellStyle("light");
  expect(active.backgroundColor).toBe(t.accentPrimary);
  expect(page.labelStyle("☀ LIGHT").color).toBe(t.textOnAccent);

  const idle = page.cellStyle("dark");
  expect(idle.backgroundColor).toBeUndefined();
  expect(page.labelStyle("☾ DARK").color).toBe(t.textSecondary);
});

// The pill shares the header row with the APPEARANCE title, so `flex: 1`
// cells (the safe-by-construction answer for a full-width segment) would be
// exactly wrong here: they would stretch the pill across the row and shove
// the title out. Intrinsic cells are the invariant, and the title's own
// `flexShrink: 1` (asserted in AppearanceScreen.test.tsx) is what absorbs a
// narrow screen.
test("cells are intrinsically sized, never flex:1", async () => {
  await page.mount("dark", () => {});

  for (const target of ["dark", "light", "system"] as const) {
    const cell = page.cellStyle(target);
    expect(cell.flex).toBeUndefined();
    expect(typeof cell.paddingHorizontal).toBe("number");
  }
});

test("each cell announces its own selected state", async () => {
  await page.mount("system", () => {});

  expect(page.cellSelected("system")).toBe(true);
  expect(page.cellSelected("dark")).toBe(false);
});
