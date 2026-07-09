import { expect, test } from "vitest";

import { fxColumnCount } from "#/ui/fxColumns";

test("phone widths get a single column", () => {
  expect(fxColumnCount(390)).toBe(1);
  expect(fxColumnCount(699)).toBe(1);
});

test("tablet/landscape widths get two columns", () => {
  expect(fxColumnCount(700)).toBe(2);
  expect(fxColumnCount(1024)).toBe(2);
});
