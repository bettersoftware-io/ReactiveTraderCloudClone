import { expect, test } from "vitest";

import {
  listRunningEmulators,
  listVirtualDevices,
  readInstalledBuildKind,
  readLocalServerPort,
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

test("a build whose flags include DEBUGGABLE is the dev build", () => {
  expect(
    readInstalledBuildKind(
      "    flags=0x0\n    flags=[ DEBUGGABLE HAS_CODE ALLOW_BACKUP ]\n",
    ),
  ).toBe("debug");
});

test("a build without DEBUGGABLE is a release build", () => {
  expect(
    readInstalledBuildKind("    flags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ]\n"),
  ).toBe("release");
});

test("no flags line means the app is not installed", () => {
  expect(
    readInstalledBuildKind("Unable to find package: io.example.app\n"),
  ).toBeNull();
});

test("a server on this machine needs its port forwarded", () => {
  expect(readLocalServerPort("ws://localhost:4000")).toBe(4000);
  expect(readLocalServerPort("ws://127.0.0.1:4100")).toBe(4100);
});

test("a local server with no port uses the scheme's default", () => {
  expect(readLocalServerPort("ws://localhost")).toBe(80);
  expect(readLocalServerPort("wss://localhost")).toBe(443);
});

// Simulator mode (empty), the deployed server, and a value that is not a URL:
// none of them is reached through the Mac's localhost.
test("nothing is forwarded for simulator mode or a remote server", () => {
  expect(readLocalServerPort("")).toBeNull();
  expect(readLocalServerPort(undefined)).toBeNull();
  expect(readLocalServerPort("wss://rtc-clone-server.fly.dev")).toBeNull();
  expect(readLocalServerPort("not a url")).toBeNull();
});
