import { expect, test } from "vitest";

import { THEME_SKINS } from "@rtc/domain";

import { cyclesToReach, SKIN_DISPLAY_ORDER } from "./appearanceLayout";

test("display order is the design's, not the domain's", () => {
  expect(SKIN_DISPLAY_ORDER).toEqual([
    "holo",
    "holo3d",
    "terminal",
    "terminal3d",
    "neon",
    "classic",
  ]);
});

test("display order is a permutation of the domain list — no skin dropped or invented", () => {
  expect([...SKIN_DISPLAY_ORDER].sort()).toEqual([...THEME_SKINS].sort());
});

test("cyclesToReach walks dark -> light -> system and wraps", () => {
  expect(cyclesToReach("dark", "dark")).toBe(0);
  expect(cyclesToReach("dark", "light")).toBe(1);
  expect(cyclesToReach("dark", "system")).toBe(2);
  expect(cyclesToReach("system", "dark")).toBe(1);
  expect(cyclesToReach("light", "dark")).toBe(2);
});
