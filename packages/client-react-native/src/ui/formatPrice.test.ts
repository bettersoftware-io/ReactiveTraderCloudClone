import { expect, test } from "vitest";

import { splitPrice } from "#/ui/formatPrice";

test("splits EURUSD 1.53816 into prefix/pips/fractional", () => {
  expect(splitPrice(1.53816, 5, 4)).toEqual({
    prefix: "1.53",
    pips: "81",
    fractional: "6",
  });
});

test("splits USDJPY 110.253 (pipsPosition 2)", () => {
  expect(splitPrice(110.253, 3, 2)).toEqual({
    prefix: "110.",
    pips: "25",
    fractional: "3",
  });
});

test("empty fractional when ratePrecision equals pipsPosition", () => {
  expect(splitPrice(1.5382, 4, 4)).toEqual({
    prefix: "1.53",
    pips: "82",
    fractional: "",
  });
});
