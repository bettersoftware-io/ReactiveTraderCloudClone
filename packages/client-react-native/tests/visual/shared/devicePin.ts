/**
 * The one device each platform's goldens were shot on, and how to recognise
 * it. A golden is only comparable to a shot from the same device, so a run
 * that drives any other device would report every scenario as a regression —
 * and an `--update` from it would quietly re-pin the whole set onto it.
 *
 * Before this existed the runners drove whichever simulator or emulator
 * happened to be running, and only the golden folder names said which device
 * was meant. On a machine whose default simulator was an iPhone Duo on
 * iOS 27.1, a run would have shot that.
 *
 * Changing a pin means re-shooting and re-reviewing every golden of that
 * platform: the folder name in `goldens.ts` is derived from it.
 */

/** iPhone 17 on any iOS 26 runtime. The goldens were shot on 26.5 (under
 * Xcode 27, which still runs iOS 26 simulators). */
export const IOS_PIN = {
  displayName: "iPhone 17",
  deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
  runtimeMajor: 26,
  /** The runtime to install when none of the pinned major is present. */
  installRuntime: "26.5",
} as const;

/** The Pixel 10a hardware profile on an API 37 system image. Matched on the
 * AVD's own `config.ini`, not its name, which is whatever its creator typed. */
export const ANDROID_PIN = {
  displayName: "Pixel 10a",
  hardwareProfile: "pixel_10a",
  apiLevel: 37,
  /** The name to give the AVD when creating one. */
  avdName: "Pixel_10a",
  systemImage: "system-images;android-37.0;google_apis_playstore;arm64-v8a",
} as const;

/** One simulator from `xcrun simctl list devices -j`, with its runtime. */
export interface Simulator {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly isAvailable: boolean;
  readonly deviceTypeIdentifier: string;
  /** The runtime identifier it is listed under, e.g.
   * `com.apple.CoreSimulator.SimRuntime.iOS-26-5`. */
  readonly runtime: string;
}

/** Every simulator in `xcrun simctl list devices -j` output. */
export function parseSimulators(simctlJson: string): Simulator[] {
  const listing = JSON.parse(simctlJson) as SimctlDeviceList;

  return Object.entries(listing.devices).flatMap(([runtime, devices]) => {
    return devices.map((device) => {
      return { ...device, runtime };
    });
  });
}

export function matchesIosPin(simulator: Simulator): boolean {
  return (
    simulator.isAvailable &&
    simulator.deviceTypeIdentifier === IOS_PIN.deviceTypeIdentifier &&
    readIosRuntimeVersion(simulator.runtime)?.[0] === IOS_PIN.runtimeMajor
  );
}

/**
 * The simulator a run should drive: a booted one first (no boot to wait for),
 * then the newest runtime, then by UDID, so the same machine always picks the
 * same device. `null` when none matches the pin.
 */
export function choosePinnedSimulator(
  simulators: readonly Simulator[],
): Simulator | null {
  const ranked = simulators.filter(matchesIosPin).sort((a, b) => {
    return (
      Number(b.state === "Booted") - Number(a.state === "Booted") ||
      compareVersions(
        readIosRuntimeVersion(b.runtime),
        readIosRuntimeVersion(a.runtime),
      ) ||
      a.udid.localeCompare(b.udid)
    );
  });

  return ranked[0] ?? null;
}

export function describeMissingIosPin(): string {
  return [
    `No ${IOS_PIN.displayName} simulator on an iOS ${IOS_PIN.runtimeMajor} runtime, which is the device the iOS goldens were shot on.`,
    "Install the runtime and create the device once:",
    `  xcodebuild -downloadPlatform iOS -buildVersion ${IOS_PIN.installRuntime}`,
    `  xcrun simctl create "${IOS_PIN.displayName}" ${IOS_PIN.deviceTypeIdentifier} com.apple.CoreSimulator.SimRuntime.iOS-${IOS_PIN.installRuntime.replace(".", "-")}`,
  ].join("\n");
}

export function describeOffPinSimulator(
  udid: string,
  simulator: Simulator | undefined,
): string {
  const what =
    simulator === undefined
      ? "is not a simulator on this machine"
      : `is ${simulator.name} on ${simulator.runtime.replace(/^.*\.SimRuntime\./, "")}`;

  return (
    `RTC_VISUAL_UDID ${udid} ${what}, but the iOS goldens were shot on ` +
    `${IOS_PIN.displayName} / iOS ${IOS_PIN.runtimeMajor}. Unset it to use ` +
    "the pinned simulator."
  );
}

/** What an AVD's `config.ini` says it is. */
export interface AvdConfig {
  readonly hardwareProfile: string | null;
  readonly apiLevel: number | null;
}

/** Reads `hw.device.name` and the API level from `image.sysdir.1`
 * (`system-images/android-37.0/…` is API 37). */
export function readAvdConfig(configIni: string): AvdConfig {
  const apiLevel = /android-(\d+)/.exec(
    readIniValue(configIni, "image.sysdir.1") ?? "",
  )?.[1];

  return {
    hardwareProfile: readIniValue(configIni, "hw.device.name"),
    apiLevel: apiLevel === undefined ? null : Number(apiLevel),
  };
}

export function matchesAndroidPin(config: AvdConfig): boolean {
  return (
    config.hardwareProfile === ANDROID_PIN.hardwareProfile &&
    config.apiLevel === ANDROID_PIN.apiLevel
  );
}

export function describeMissingAndroidPin(): string {
  return [
    `No ${ANDROID_PIN.displayName} AVD on API ${ANDROID_PIN.apiLevel}, which is the device the Android goldens were shot on.`,
    "Create it once (sdkmanager and avdmanager come with the Android SDK Command-line Tools):",
    `  sdkmanager "${ANDROID_PIN.systemImage}"`,
    `  avdmanager create avd -n ${ANDROID_PIN.avdName} -k "${ANDROID_PIN.systemImage}" -d ${ANDROID_PIN.hardwareProfile}`,
  ].join("\n");
}

export function describeOffPinEmulator(
  serial: string,
  avd: string | null,
): string {
  const what =
    avd === null ? "is not a running emulator" : `runs the AVD ${avd}`;

  return (
    `RTC_VISUAL_UDID ${serial} ${what}, but the Android goldens were shot on ` +
    `${ANDROID_PIN.displayName} / API ${ANDROID_PIN.apiLevel}. Unset it to ` +
    "use the pinned emulator."
  );
}

/** `[26, 5]` from `com.apple.CoreSimulator.SimRuntime.iOS-26-5`; `null` for a
 * runtime of another OS. */
function readIosRuntimeVersion(runtime: string): number[] | null {
  const match = /\.SimRuntime\.iOS-(\d+(?:-\d+)*)$/.exec(runtime);

  return match?.[1]?.split("-").map(Number) ?? null;
}

/** The value of `key=` in an `.ini` file, `null` when the key is absent. */
function readIniValue(ini: string, key: string): string | null {
  const line = ini.split("\n").find((candidate) => {
    return candidate.startsWith(`${key}=`);
  });

  return line?.slice(key.length + 1).trim() ?? null;
}

/** Descending order needs `b` first; missing parts count as 0. */
function compareVersions(a: number[] | null, b: number[] | null): number {
  const left = a ?? [];
  const right = b ?? [];

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

interface SimctlDeviceList {
  readonly devices: Record<string, readonly Omit<Simulator, "runtime">[]>;
}
