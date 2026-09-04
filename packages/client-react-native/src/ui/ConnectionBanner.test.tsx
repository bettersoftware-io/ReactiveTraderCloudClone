import { expect, jest, test } from "@jest/globals";

import { ConnectionStatus } from "@rtc/domain";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { connectionBannerPage } from "#tests/pages/ConnectionBannerPage";

const page = connectionBannerPage();

test("renders nothing when connected — the header dot carries that state", async () => {
  await page.mount(ConnectionStatus.CONNECTED);
  expect(page.exists("connection-dot")).toBe(false);
  expect(page.hasText("LIVE")).toBe(false);
  expect(page.hasText("RECONNECT ▸")).toBe(false);
});

test("colours the status dot statusConnecting while connecting", async () => {
  await page.mount(ConnectionStatus.CONNECTING);
  expect(page.dotColor()).toBe(rnThemeTokens.holo.dark.statusConnecting);
});

test("colours the status dot statusDisconnected when disconnected (not the connected green)", async () => {
  await page.mount(ConnectionStatus.DISCONNECTED);
  expect(page.dotColor()).toBe(rnThemeTokens.holo.dark.statusDisconnected);
  expect(page.dotColor()).not.toBe(rnThemeTokens.holo.dark.statusConnected);
});

test("shows CONNECTING… and hides RECONNECT while connecting", async () => {
  await page.mount(ConnectionStatus.CONNECTING);
  expect(page.hasText("CONNECTING…")).toBeTruthy();
  expect(page.hasText("RECONNECT ▸")).toBe(false);
});

test("shows DISCONNECTED with a RECONNECT button that calls reconnect", async () => {
  const reconnect = jest.fn<() => void>();
  await page.mount(ConnectionStatus.DISCONNECTED, reconnect);
  expect(page.hasText("DISCONNECTED")).toBeTruthy();
  await page.pressText("RECONNECT ▸");
  expect(reconnect).toHaveBeenCalledTimes(1);
});
