import { expect, test } from "@jest/globals";

import type { HistoricPosition } from "@rtc/domain";

import { pnlChartPage } from "#tests/pages/PnlChartPage";

const page = pnlChartPage();

test("mounts for a normal history", async () => {
  await page.mount([h(0), h(10)]);
  expect(page.exists("pnl-chart")).toBeTruthy();
});

test("mounts for fewer than two points, where there is no path to draw", async () => {
  await page.mount([h(5)]);
  expect(page.exists("pnl-chart")).toBeTruthy();
});

test("mounts for an empty history", async () => {
  await page.mount([]);
  expect(page.exists("pnl-chart")).toBeTruthy();
});

// A flat history makes max - min zero; buildChart guards that with `|| 1`, and
// a divide-by-zero here would surface as NaN coordinates rather than a throw —
// which Skia would silently decline to draw.
test("survives a completely flat history without producing NaN coordinates", async () => {
  await page.mount([h(7), h(7), h(7)]);
  expect(page.exists("pnl-chart")).toBeTruthy();
});

test("survives a history that crosses zero, which adds the baseline", async () => {
  await page.mount([h(-5), h(0), h(5)]);
  expect(page.exists("pnl-chart")).toBeTruthy();
});

test("survives an all-negative history, which flips the stroke colour", async () => {
  await page.mount([h(-10), h(-5)]);
  expect(page.exists("pnl-chart")).toBeTruthy();
});

test("survives a 90-point history, the size the simulator actually emits", async () => {
  const history = Array.from({ length: 90 }, (_, i) => {
    return h(Math.sin(i / 5) * 1000);
  });

  await page.mount(history);
  expect(page.exists("pnl-chart")).toBeTruthy();
});

function h(usdPnl: number): HistoricPosition {
  return { timestamp: `t${usdPnl}`, usdPnl };
}
