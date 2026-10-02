import { expect, test } from "vitest";

import { formatNotional } from "#/ui/credit/formatNotional";

test.each([
  [5_000_000, "5.0M USD"],
  [2_500_000, "2.5M USD"],
  [1_000_000, "1.0M USD"],
  [250_000, "250K USD"],
  [1_000, "1K USD"],
  [25, "25 USD"],
])("%d reads %s", (quantity, text) => {
  expect(formatNotional(quantity)).toBe(text);
});
