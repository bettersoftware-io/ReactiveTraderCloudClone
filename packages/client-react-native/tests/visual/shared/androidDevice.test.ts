import { execFile, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, expect, test, vi } from "vitest";

import {
  hideAndroidDevMenu,
  resolvePinnedEmulator,
  restoreAndroidDevMenu,
  reverseMetroPort,
} from "./androidDevice";

beforeEach(() => {
  vi.mocked(spawn).mockClear();
  vi.mocked(spawn).mockReturnValue({ unref: vi.fn() } as never);
  vi.stubEnv("ANDROID_AVD_HOME", createAvdHome());
});

// The machine this was written for had a Pixel 8 on API 36.1 running; the
// old resolver took whichever single device was attached.
test("a running emulator on the pinned AVD is chosen over one that is not", async () => {
  createStubAdb({
    devices: ["emulator-5554\tdevice", "emulator-5556\tdevice"],
    runningAvds: { "emulator-5554": "Pixel_8", "emulator-5556": "Pixel_10a" },
  });
  await expect(resolvePinnedEmulator(undefined)).resolves.toBe("emulator-5556");
  expect(spawn).not.toHaveBeenCalled();
});

// An `offline` or `unauthorized` row is listed by adb but cannot be driven,
// and a phone has no AVD to check against the pin.
test("only ready emulators count as running", async () => {
  createStubAdb({
    devices: ["emulator-5554\toffline", "R5CX\tdevice"],
    runningAvds: { "emulator-5554": "Pixel_10a" },
    avds: ["Pixel_10a"],
  });
  await expect(resolvePinnedEmulator(undefined)).resolves.toBe("emulator-5554");
  expect(spawn).toHaveBeenCalledOnce();
});

test("the pinned AVD is started headless and cold when none is running", async () => {
  const stub = createStubAdb({
    devices: ["emulator-5554\tdevice"],
    runningAvds: { "emulator-5554": "Pixel_8" },
    avds: ["Medium_Phone", "Pixel_10a", "Pixel_8"],
  });

  await expect(resolvePinnedEmulator(undefined)).resolves.toBe("emulator-5556");
  expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual([
    "-avd",
    "Pixel_10a",
    "-port",
    "5556",
    "-no-window",
    "-no-snapshot",
  ]);
  expect(stub.calls).toContainEqual([
    "-s",
    "emulator-5556",
    "shell",
    "getprop",
    "sys.boot_completed",
  ]);
});

test("a machine without the pinned AVD is told how to create it", async () => {
  createStubAdb({ avds: ["Medium_Phone", "Pixel_8"] });
  await expect(resolvePinnedEmulator(undefined)).rejects.toThrow(
    "avdmanager create avd -n Pixel_10a",
  );
  expect(spawn).not.toHaveBeenCalled();
});

test("a requested emulator that is not the pin is refused", async () => {
  createStubAdb({
    devices: ["emulator-5554\tdevice"],
    runningAvds: { "emulator-5554": "Pixel_8" },
  });
  await expect(resolvePinnedEmulator("emulator-5554")).rejects.toThrow(
    "RTC_VISUAL_UDID emulator-5554 runs the AVD Pixel_8",
  );
});

test("the Metro port is forwarded from the device to this machine", async () => {
  const stub = createStubAdb({});
  await reverseMetroPort("emulator-5554", "8083");
  expect(stub.calls).toEqual([
    ["-s", "emulator-5554", "reverse", "tcp:8083", "tcp:8083"],
  ]);
});

// Not best-effort: without the forward no flow can load the bundle, and the
// run would report 26 `login-screen` timeouts instead of this one cause.
test("a refused port forward fails the run", async () => {
  createStubAdb({ fail: true });
  await expect(reverseMetroPort("emulator-5554", "8083")).rejects.toThrow(
    "adb refused",
  );
});

test("hiding the dev menu stops the app, then writes all three preferences", async () => {
  const stub = createStubAdb({});
  await hideAndroidDevMenu("emulator-5554");

  expect(stub.calls[0]).toEqual([
    "-s",
    "emulator-5554",
    "shell",
    "am",
    "force-stop",
    "io.bettersoftware.rtcmobile",
  ]);
  // The floating gear, plus the two that make the menu open itself at launch.
  expect(stub.inputs).toHaveLength(1);
  expect(stub.inputs[0]).toContain('name="showFab" value="false"');
  expect(stub.inputs[0]).toContain('name="showsAtLaunch" value="false"');
  expect(stub.inputs[0]).toContain('name="isOnboardingFinished" value="true"');
});

test("restoring writes back the preferences the app had before", async () => {
  const stub = createStubAdb({ preferences: "<map>mine</map>" });
  const backup = await hideAndroidDevMenu("emulator-5554");
  await restoreAndroidDevMenu("emulator-5554", backup);

  expect(backup.previous).toBe("<map>mine</map>");
  expect(stub.inputs.at(-1)).toBe("<map>mine</map>");
});

// Removing, not writing defaults back: the app returns to whatever its own
// build ships, where a written value would pin it to one this harness chose.
test("restoring removes the file when the app had none", async () => {
  const stub = createStubAdb({});
  const backup = await hideAndroidDevMenu("emulator-5554");
  await restoreAndroidDevMenu("emulator-5554", backup);

  expect(backup.previous).toBeNull();
  expect(stub.calls.at(-1)?.at(-1)).toContain("rm -f shared_prefs/");
});

// Mirrors `hideDevMenuFab`: a device that will not take the writes should cost
// a noisier golden, never a failed run.
test("hiding the dev menu does not throw when adb refuses", async () => {
  createStubAdb({ fail: true });
  await expect(hideAndroidDevMenu("emulator-5554")).resolves.toEqual({
    previous: null,
  });
});

vi.mock("node:child_process", () => {
  return { execFile: vi.fn(), spawn: vi.fn() };
});

/** Stands in for `adb`: records each call's argv and whatever was piped to its
 * stdin, answers `devices` and the preferences `cat`, and fails every call
 * when asked to. The callback MUST be invoked — a stub that only recorded would
 * leave each promise pending and the tests would time out rather than fail. */
function createStubAdb(options: StubAdbOptions): StubAdb {
  const calls: string[][] = [];
  const inputs: string[] = [];

  vi.mocked(execFile).mockImplementation(((
    _command: string,
    args: string[],
    callback: ExecFileCallback,
  ) => {
    calls.push(args);
    const last = args.at(-1) ?? "";
    const readsPreferences = last.includes(" cat shared_prefs/");

    if (
      options.fail ||
      (readsPreferences && options.preferences === undefined)
    ) {
      callback(new Error("adb refused"), "");
    } else if (args[0] === "devices") {
      callback(
        null,
        ["List of devices attached", ...(options.devices ?? []), ""].join("\n"),
      );
    } else if (args[0] === "-list-avds") {
      callback(null, [...(options.avds ?? []), ""].join("\n"));
    } else if (args.slice(2).join(" ") === "emu avd name") {
      const avd = options.runningAvds?.[args[1] ?? ""];
      callback(null, avd === undefined ? "" : `${avd}\r\nOK\r\n`);
    } else if (args.at(-1) === "sys.boot_completed") {
      callback(null, "1\n");
    } else {
      callback(null, readsPreferences ? (options.preferences ?? "") : "");
    }

    return {
      stdin: {
        end: (input: string): void => {
          inputs.push(input);
        },
      },
    };
  }) as unknown as typeof execFile);

  return { calls, inputs };
}

/** An AVD home holding this machine's three AVDs, of which only `Pixel_10a`
 * is the pin. Each `<name>.ini` points at its directory, as avdmanager writes
 * it. */
function createAvdHome(): string {
  const home = mkdtempSync(join(tmpdir(), "rtc-avd-home-"));

  for (const [name, profile, android] of [
    ["Pixel_10a", "pixel_10a", "37.0"],
    ["Pixel_8", "pixel_8", "36.1"],
    ["Medium_Phone", "medium_phone", "37.0"],
  ] as const) {
    const directory = join(home, `${name}.avd`);
    mkdirSync(directory);
    writeFileSync(join(home, `${name}.ini`), `path=${directory}\n`);
    writeFileSync(
      join(directory, "config.ini"),
      `hw.device.name=${profile}\nimage.sysdir.1=system-images/android-${android}/google_apis_playstore/arm64-v8a/\n`,
    );
  }

  return home;
}

type ExecFileCallback = (error: Error | null, stdout: string) => void;

interface StubAdbOptions {
  readonly devices?: readonly string[];
  /** Which AVD each running emulator answers `emu avd name` with. */
  readonly runningAvds?: Readonly<Record<string, string>>;
  /** What `emulator -list-avds` lists. */
  readonly avds?: readonly string[];
  readonly preferences?: string;
  readonly fail?: boolean;
}

interface StubAdb {
  readonly calls: string[][];
  readonly inputs: string[];
}
