import { expect, test } from "vitest";

import { EQ_WATCHLIST_SORTS } from "@rtc/domain";

import { RANK_DISPLAY_ORDER } from "./rankByLayout";

test("display order is the design's, not the domain's", () => {
  expect(RANK_DISPLAY_ORDER).toEqual(["chg", "price", "sym"]);
});

test("display order is a permutation of the domain list — no sort dropped or invented", () => {
  expect([...RANK_DISPLAY_ORDER].sort()).toEqual(
    [...EQ_WATCHLIST_SORTS].sort(),
  );
});
