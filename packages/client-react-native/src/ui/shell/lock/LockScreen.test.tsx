import { afterEach, expect, jest, test } from "@jest/globals";

import { type LockUser, lockScreenPage } from "#tests/pages/LockScreenPage";

const USER: LockUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};

const page = lockScreenPage();

afterEach(() => {
  page.unmountAll();
});

test("renders nothing when the session is unlocked", async () => {
  await page.mount(false, noop, USER);
  expect(page.exists("lock-screen")).toBe(false);
});

test("shows the operator's id · desk line, uppercased, when locked", async () => {
  await page.mount(true, noop, USER);
  expect(page.exists("lock-title")).toBe(true);
  expect(page.exists("lock-emblem")).toBe(true);
  expect(page.textOf("lock-desk")).toBe("TRD-0042 · G10 SPOT · LONDON");
});

test("the ring's label reads HOLD TO UNLOCK at rest and AUTHENTICATING… while an unlock is in flight", async () => {
  await page.mountLocked(true, noop, USER);
  expect(page.textOf("lock-hold-label")).toBe("HOLD TO UNLOCK");

  await page.rerenderLocked(true, noop, USER, true);
  expect(page.textOf("lock-hold-label")).toBe("AUTHENTICATING…");
});

test("AUTHENTICATE press calls unlock with the typed password", async () => {
  const unlock = jest.fn();
  await page.mount(true, unlock, USER);
  await page.typePassword("correct-horse-battery-staple");
  await page.pressAuthenticate();
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(unlock).toHaveBeenCalledWith("correct-horse-battery-staple");
});

test("renders the auth error when unlock fails", async () => {
  await page.mount(true, noop, USER, "Invalid credentials");
  expect(page.textOf("lock-error")).toBe("Invalid credentials");
});

test("renders nothing when locked but no user is present", async () => {
  await page.mount(true, noop, null);
  expect(page.exists("lock-screen")).toBe(false);
});

test("fires the success haptic exactly once on unlock, and re-arms for a later lock", async () => {
  const Haptics = require("expo-haptics") as MockedHaptics;
  Haptics.notificationAsync.mockClear();

  const unlock = jest.fn();
  await page.mountLocked(true, unlock, USER);
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();

  await page.rerenderLocked(false, unlock, USER);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Success,
  );

  // Re-render while still unlocked (a fresh but logically identical state) —
  // must NOT re-fire the once-guard.
  await page.rerenderLocked(false, unlock, USER);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);

  // Lock again, then unlock again — the guard must re-arm for the next cycle.
  await page.rerenderLocked(true, unlock, USER);
  await page.rerenderLocked(false, unlock, USER);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
});

test("a fresh submit after a wrong-password error calls unlock again", async () => {
  // No app-level submit guard: the operator can retry after a failed attempt.
  // (Whether hold + tap double-fire for one interaction is deferred to the
  // on-device task — see LockScreen's header comment.)
  const unlock = jest.fn();
  await page.mount(true, unlock, USER, "Invalid credentials");
  await page.typePassword("again");
  await page.pressAuthenticate();
  await page.pressAuthenticate();
  expect(unlock).toHaveBeenCalledTimes(2);
  expect(unlock).toHaveBeenNthCalledWith(2, "again");
});

function noop(): undefined {
  return undefined;
}

interface MockedHaptics {
  notificationAsync: jest.Mock;
  NotificationFeedbackType: { Success: string };
}
