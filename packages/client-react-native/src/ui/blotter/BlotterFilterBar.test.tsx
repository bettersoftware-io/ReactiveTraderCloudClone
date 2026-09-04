import { expect, jest, test } from "@jest/globals";

import type { BlotterFilter } from "#/ui/blotter/blotterFilter";
import { blotterFilterBarPage } from "#tests/pages/BlotterFilterBarPage";

const page = blotterFilterBarPage();

test("renders chips + summary and reports selection", async () => {
  const onSelect = jest.fn<(f: BlotterFilter) => void>();
  await page.mount("ALL", onSelect, { fills: 4, buys: 3, sells: 1 });

  expect(page.hasText("REJECTED")).toBeTruthy();
  expect(page.hasTextMatching(/4 FILLS/)).toBeTruthy();

  await page.pressText("DONE");
  expect(onSelect).toHaveBeenCalledWith("DONE");
});
