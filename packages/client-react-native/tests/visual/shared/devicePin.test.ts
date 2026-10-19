import { describe, expect, it } from "vitest";

import {
  choosePinnedSimulator,
  describeMissingIosPin,
  matchesAndroidPin,
  matchesIosPin,
  parseSimulators,
  readAvdConfig,
  type Simulator,
} from "./devicePin.ts";

describe("the iOS pin", () => {
  it("is an iPhone 17 on any iOS 26 runtime", () => {
    expect(matchesIosPin(createSimulator({ runtime: IOS_26_5 }))).toBe(true);
    expect(matchesIosPin(createSimulator({ runtime: IOS_26_2 }))).toBe(true);
  });

  // The device type, not the name: a simulator can be renamed in Xcode.
  it("rejects another device, another runtime, and an unavailable one", () => {
    expect(
      matchesIosPin(createSimulator({ deviceTypeIdentifier: IPHONE_DUO })),
    ).toBe(false);
    expect(matchesIosPin(createSimulator({ runtime: IOS_27_1 }))).toBe(false);
    expect(matchesIosPin(createSimulator({ isAvailable: false }))).toBe(false);
  });

  // The machine this was written for: `pnpm dev:ios` had left an iPhone Duo
  // on iOS 27.1 booted, and the old resolver took whichever one was booted.
  it("skips a booted simulator that is not the pin for a shut-down one that is", () => {
    const duo = createSimulator({
      udid: "DUO",
      deviceTypeIdentifier: IPHONE_DUO,
      runtime: IOS_27_1,
      state: "Booted",
    });
    const pinned = createSimulator({ udid: "PINNED", state: "Shutdown" });

    expect(choosePinnedSimulator([duo, pinned])?.udid).toBe("PINNED");
  });

  it("prefers a booted pinned simulator, then the newest runtime", () => {
    const old = createSimulator({ udid: "A", runtime: IOS_26_2 });
    const newest = createSimulator({ udid: "B", runtime: IOS_26_5 });
    const booted = createSimulator({
      udid: "C",
      runtime: IOS_26_2,
      state: "Booted",
    });

    expect(choosePinnedSimulator([old, newest])?.udid).toBe("B");
    expect(choosePinnedSimulator([old, newest, booted])?.udid).toBe("C");
  });

  it("chooses nothing when no simulator matches", () => {
    expect(
      choosePinnedSimulator([createSimulator({ runtime: IOS_27_1 })]),
    ).toBeNull();
  });

  it("tells the reader how to install the missing device", () => {
    expect(describeMissingIosPin()).toContain(
      "xcodebuild -downloadPlatform iOS -buildVersion 26.5",
    );
  });

  it("reads simulators with the runtime they are listed under", () => {
    const listing = JSON.stringify({
      devices: { [IOS_26_5]: [createSimctlDevice()], [IOS_27_1]: [] },
    });

    expect(parseSimulators(listing)).toEqual([
      { ...createSimctlDevice(), runtime: IOS_26_5 },
    ]);
  });
});

describe("the Android pin", () => {
  it("is the Pixel 10a hardware profile on an API 37 image", () => {
    expect(
      matchesAndroidPin(readAvdConfig(createAvdConfigIni("pixel_10a", "37.0"))),
    ).toBe(true);
  });

  // The two AVDs this machine had before the pin was created.
  it("rejects another hardware profile or another API level", () => {
    expect(
      matchesAndroidPin(readAvdConfig(createAvdConfigIni("pixel_8", "36.1"))),
    ).toBe(false);
    expect(
      matchesAndroidPin(
        readAvdConfig(createAvdConfigIni("medium_phone", "37.0")),
      ),
    ).toBe(false);
    expect(
      matchesAndroidPin(readAvdConfig(createAvdConfigIni("pixel_10a", "36.1"))),
    ).toBe(false);
  });

  it("matches nothing for a config it cannot read", () => {
    expect(matchesAndroidPin(readAvdConfig(""))).toBe(false);
  });
});

function createSimulator(overrides: Partial<Simulator>): Simulator {
  return {
    ...createSimctlDevice(),
    runtime: IOS_26_5,
    ...overrides,
  };
}

function createSimctlDevice(): Omit<Simulator, "runtime"> {
  return {
    udid: "55B42959-BBCF-4CBE-9E51-FFDE6AC9D161",
    name: "iPhone 17",
    state: "Shutdown",
    isAvailable: true,
    deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
  };
}

/** The lines of an AVD's `config.ini` that the pin reads, among others. */
function createAvdConfigIni(hardwareProfile: string, android: string): string {
  return [
    "abi.type=arm64-v8a",
    `hw.device.name=${hardwareProfile}`,
    "hw.lcd.width=1080",
    `image.sysdir.1=system-images/android-${android}/google_apis_playstore/arm64-v8a/`,
  ].join("\n");
}

const IOS_26_2 = "com.apple.CoreSimulator.SimRuntime.iOS-26-2";
const IOS_26_5 = "com.apple.CoreSimulator.SimRuntime.iOS-26-5";
const IOS_27_1 = "com.apple.CoreSimulator.SimRuntime.iOS-27-1";
const IPHONE_DUO = "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo";
