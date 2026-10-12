import { execFile } from "node:child_process";

import { expect, test, vi } from "vitest";

import {
  hideAndroidDevMenu,
  resolveAndroidSerial,
  restoreAndroidDevMenu,
  reverseMetroPort,
} from "./androidDevice";

test("the one attached device's serial is resolved", async () => {
  createStubAdb({ devices: ["emulator-5554\tdevice"] });
  await expect(resolveAndroidSerial()).resolves.toBe("emulator-5554");
});

// An `offline` or `unauthorized` row is listed by adb but cannot be driven.
test("a device that is not ready does not count", async () => {
  createStubAdb({ devices: ["emulator-5554\toffline"] });
  await expect(resolveAndroidSerial()).rejects.toThrow(
    "No running Android emulator or device found",
  );
});

test("two attached devices are refused rather than guessed between", async () => {
  createStubAdb({
    devices: ["emulator-5554\tdevice", "emulator-5556\tdevice"],
  });
  await expect(resolveAndroidSerial()).rejects.toThrow(
    "2 Android devices are attached (emulator-5554, emulator-5556)",
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
  return { execFile: vi.fn() };
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

type ExecFileCallback = (error: Error | null, stdout: string) => void;

interface StubAdbOptions {
  readonly devices?: readonly string[];
  readonly preferences?: string;
  readonly fail?: boolean;
}

interface StubAdb {
  readonly calls: string[][];
  readonly inputs: string[];
}
