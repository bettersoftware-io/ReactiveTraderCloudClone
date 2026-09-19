import { expect, test } from "@jest/globals";

import { motionProbePage } from "#tests/pages/MotionProbePage";

test("MotionProbe renders the reanimated + skia probe surface", async () => {
  await page.mount();
  expect(page.exists("motion-probe")).toBeTruthy();
  await page.unmountAll();
});

const page = motionProbePage();
