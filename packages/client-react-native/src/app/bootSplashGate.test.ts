import { expect, test } from "vitest";

import { shouldPlayBootSplash } from "#/app/bootSplashGate";

test("boot splash plays on every launch", () => {
  expect(shouldPlayBootSplash()).toBe(true);
});
