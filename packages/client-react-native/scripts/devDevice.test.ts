import { describe, expect, it } from "vitest";

import {
  chooseDevEmulator,
  hasDeviceArgument,
  takeDeviceArgument,
} from "./devDevice.ts";

describe("hasDeviceArgument", () => {
  it("sees every spelling expo run:ios accepts", () => {
    expect(hasDeviceArgument(["--device", "iPhone Duo"])).toBe(true);
    expect(hasDeviceArgument(["--device=iPhone Duo"])).toBe(true);
    expect(hasDeviceArgument(["-d", "iPhone Duo"])).toBe(true);
    // Bare: Expo asks which one, which is still the caller choosing.
    expect(hasDeviceArgument(["--device"])).toBe(true);
  });

  it("is false when no device is named", () => {
    expect(hasDeviceArgument([])).toBe(false);
    expect(hasDeviceArgument(["--port", "8090"])).toBe(false);
  });
});

describe("takeDeviceArgument", () => {
  it("splits the device off and keeps the other arguments", () => {
    expect(
      takeDeviceArgument(["--device", "Pixel_8", "--port", "8090"]),
    ).toEqual({ device: "Pixel_8", rest: ["--port", "8090"] });
    expect(takeDeviceArgument(["--device=Pixel_8"])).toEqual({
      device: "Pixel_8",
      rest: [],
    });
  });

  it("leaves the device undefined when none is named", () => {
    expect(takeDeviceArgument(["--port", "8090"])).toEqual({
      device: undefined,
      rest: ["--port", "8090"],
    });
  });
});

describe("chooseDevEmulator", () => {
  it("starts the pinned AVD by default, even when another is running", () => {
    expect(
      chooseDevEmulator(
        createOptions({
          running: [{ serial: "emulator-5554", avd: "Pixel_8" }],
        }),
      ),
    ).toEqual({ avd: "Pixel_10a", serial: null });
  });

  it("reuses the pinned AVD when it is already running", () => {
    expect(
      chooseDevEmulator(
        createOptions({
          running: [{ serial: "emulator-5556", avd: "Pixel_10a" }],
        }),
      ),
    ).toEqual({ avd: "Pixel_10a", serial: "emulator-5556" });
  });

  it("uses the AVD asked for over the pinned one", () => {
    expect(
      chooseDevEmulator(
        createOptions({
          requested: "Pixel_8",
          running: [{ serial: "emulator-5554", avd: "Pixel_8" }],
        }),
      ),
    ).toEqual({ avd: "Pixel_8", serial: "emulator-5554" });
  });

  // Starting some other device than the one named would be a surprise.
  it("chooses nothing when the AVD asked for does not exist", () => {
    expect(
      chooseDevEmulator(createOptions({ requested: "Pixel_9" })),
    ).toBeNull();
  });

  it("without a pinned AVD, keeps a running emulator, else the first AVD", () => {
    expect(
      chooseDevEmulator(
        createOptions({
          pinned: null,
          running: [{ serial: "emulator-5554", avd: "Pixel_8" }],
        }),
      ),
    ).toEqual({ avd: "Pixel_8", serial: "emulator-5554" });
    expect(chooseDevEmulator(createOptions({ pinned: null }))).toEqual({
      avd: "Medium_Phone_API_37.0",
      serial: null,
    });
  });

  it("chooses nothing on a machine without AVDs", () => {
    expect(
      chooseDevEmulator(createOptions({ pinned: null, available: [] })),
    ).toBeNull();
  });
});

/** This machine on 2026-10-20: three AVDs, `Pixel_10a` the pinned one, none
 * running. */
function createOptions(
  overrides: Partial<Parameters<typeof chooseDevEmulator>[0]>,
): Parameters<typeof chooseDevEmulator>[0] {
  return {
    requested: undefined,
    pinned: "Pixel_10a",
    running: [],
    available: ["Medium_Phone_API_37.0", "Pixel_10a", "Pixel_8"],
    ...overrides,
  };
}
