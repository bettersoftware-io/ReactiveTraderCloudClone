import { afterEach, expect, test } from "@jest/globals";

import { FONT_JETBRAINS_MONO } from "#/ui/theme/fontFamilies";
import { sectionLabelPage } from "#tests/pages/SectionLabelPage";

const page = sectionLabelPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the caption; `spaced` adds the follow-on top margin", async () => {
  await page.mountPair("ORDERS", "POSITIONS");
  expect(page.styleOf("ORDERS").marginTop).toBe(3);
  expect(page.styleOf("POSITIONS").marginTop).toBe(12);
});

// See BlotterHeader.test.tsx: the same pin, on the widest-tracked member of
// the `labelStyle` family.
test("keeps the 8.5pt / 2-tracked mono label recipe", async () => {
  await page.mountOne("ORDERS");

  const style = page.styleOf("ORDERS");

  expect(style.fontFamily).toBe(FONT_JETBRAINS_MONO);
  expect(style.fontSize).toBe(8.5);
  expect(style.letterSpacing).toBe(2);
  expect(style.fontWeight).toBeUndefined();
});
