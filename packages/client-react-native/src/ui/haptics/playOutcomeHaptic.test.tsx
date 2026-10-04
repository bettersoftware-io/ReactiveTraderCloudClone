import { beforeEach, expect, type jest, test } from "@jest/globals";

import { playOutcomeHaptic } from "#/ui/haptics/playOutcomeHaptic";

beforeEach(() => {
  Haptics.notificationAsync.mockClear();
});

test("a positive outcome plays the success notification", () => {
  playOutcomeHaptic(true);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Success,
  );
});

test("a negative outcome plays the error notification", () => {
  playOutcomeHaptic(false);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Error,
  );
});

interface MockedHaptics {
  notificationAsync: jest.Mock;
  NotificationFeedbackType: { Success: string; Error: string };
}

const Haptics = require("expo-haptics") as MockedHaptics;
