import { expect, test } from "vitest";

import {
  chooseVirtualDevice,
  listRunningEmulators,
  listVirtualDevices,
} from "./androidEmulator.ts";

test("finds a running emulator in adb's device list", () => {
  expect(
    listRunningEmulators("List of devices attached\nemulator-5554\tdevice\n\n"),
  ).toEqual(["emulator-5554"]);
});

test("an empty device list has no running emulator", () => {
  expect(listRunningEmulators("List of devices attached\n\n")).toEqual([]);
});

// The install would fail against either: one is not ready, the other is not
// where a preview build is meant to land.
test("an offline emulator and a physical phone do not count", () => {
  expect(
    listRunningEmulators(
      "List of devices attached\nemulator-5554\toffline\nR58M123ABC\tdevice\n",
    ),
  ).toEqual([]);
});

test("reads virtual device names, skipping the emulator's log lines", () => {
  expect(
    listVirtualDevices(
      "INFO    | Storing crashdata in: /tmp/x\nPixel_10a\nPixel_8_API_35\n",
    ),
  ).toEqual(["Pixel_10a", "Pixel_8_API_35"]);
});

test("with no preference, the first virtual device is chosen", () => {
  expect(chooseVirtualDevice(["Pixel_10a", "Pixel_8"], undefined)).toBe(
    "Pixel_10a",
  );
  expect(chooseVirtualDevice(["Pixel_10a", "Pixel_8"], "")).toBe("Pixel_10a");
});

test("a named virtual device is chosen when it exists", () => {
  expect(chooseVirtualDevice(["Pixel_10a", "Pixel_8"], "Pixel_8")).toBe(
    "Pixel_8",
  );
});

// Starting some other device than the one named would be a surprise.
test("a named device that does not exist chooses nothing", () => {
  expect(chooseVirtualDevice(["Pixel_10a"], "Pixel_9")).toBeNull();
});

test("no virtual devices chooses nothing", () => {
  expect(chooseVirtualDevice([], undefined)).toBeNull();
});
