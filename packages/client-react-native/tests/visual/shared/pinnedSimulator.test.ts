import { execFile } from "node:child_process";

import { expect, test, vi } from "vitest";

import {
  refuseMissingDevClient,
  resolvePinnedSimulator,
} from "./pinnedSimulator.ts";

test("a shut-down pinned simulator is booted, and its UDID returned", async () => {
  const calls = createStubSimctl({ listing: createListing("Shutdown") });

  await expect(resolvePinnedSimulator(undefined)).resolves.toBe(PINNED);
  expect(calls).toContainEqual(["simctl", "bootstatus", PINNED, "-b"]);
});

test("a booted pinned simulator is used as it is", async () => {
  const calls = createStubSimctl({ listing: createListing("Booted") });

  await expect(resolvePinnedSimulator(undefined)).resolves.toBe(PINNED);
  expect(
    calls.some((args) => {
      return args.includes("bootstatus");
    }),
  ).toBe(false);
});

// The old resolver honoured RTC_VISUAL_UDID blindly, so naming the wrong
// simulator shot it against goldens it could never match.
test("a requested simulator that is not the pin is refused", async () => {
  createStubSimctl({ listing: createListing("Booted") });

  await expect(resolvePinnedSimulator(DUO)).rejects.toThrow(
    `RTC_VISUAL_UDID ${DUO} is iPhone Duo on iOS-27-1`,
  );
});

test("a requested pinned simulator is used", async () => {
  createStubSimctl({ listing: createListing("Booted") });

  await expect(resolvePinnedSimulator(PINNED)).resolves.toBe(PINNED);
});

test("a machine without the pinned device is told how to create it", async () => {
  createStubSimctl({ listing: createListing(null) });

  await expect(resolvePinnedSimulator(undefined)).rejects.toThrow(
    "No iPhone 17 simulator on an iOS 26 runtime",
  );
});

test("a simulator without the dev client is refused with the install command", async () => {
  createStubSimctl({ listing: createListing("Booted"), noApp: true });

  await expect(refuseMissingDevClient(PINNED)).rejects.toThrow(
    `expo run:ios --device ${PINNED}`,
  );
});

test("a simulator with the dev client passes", async () => {
  createStubSimctl({ listing: createListing("Booted") });

  await expect(refuseMissingDevClient(PINNED)).resolves.toBeUndefined();
});

vi.mock("node:child_process", () => {
  return { execFile: vi.fn() };
});

/** Stands in for `xcrun`: answers `simctl list` with `listing`, fails
 * `get_app_container` when there is no app, and records every argv. The
 * callback MUST be invoked, or each promise would stay pending. */
function createStubSimctl(options: StubSimctlOptions): string[][] {
  const calls: string[][] = [];

  vi.mocked(execFile).mockImplementation(((
    _command: string,
    args: string[],
    callback: ExecFileCallback,
  ) => {
    calls.push(args);

    if (args[1] === "get_app_container" && options.noApp === true) {
      callback(new Error("No such app"), { stdout: "", stderr: "" });
    } else {
      callback(null, {
        stdout: args[1] === "list" ? options.listing : "",
        stderr: "",
      });
    }

    return undefined;
  }) as unknown as typeof execFile);

  return calls;
}

/** A machine with an iPhone Duo on iOS 27.1, booted, and — unless `pinned` is
 * `null` — an iPhone 17 on iOS 26.5 in the given state. */
function createListing(pinned: "Booted" | "Shutdown" | null): string {
  return JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-5":
        pinned === null
          ? []
          : [
              {
                udid: PINNED,
                name: "iPhone 17",
                state: pinned,
                isAvailable: true,
                deviceTypeIdentifier:
                  "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
              },
            ],
      "com.apple.CoreSimulator.SimRuntime.iOS-27-1": [
        {
          udid: DUO,
          name: "iPhone Duo",
          state: "Booted",
          isAvailable: true,
          deviceTypeIdentifier:
            "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo",
        },
      ],
    },
  });
}

type ExecFileCallback = (error: Error | null, result: ExecFileResult) => void;

interface ExecFileResult {
  stdout: string;
  stderr: string;
}

interface StubSimctlOptions {
  readonly listing: string;
  readonly noApp?: boolean;
}

const PINNED = "55B42959-BBCF-4CBE-9E51-FFDE6AC9D161";
const DUO = "E6ABB4A7-F34F-4564-BC24-B148635E4CC1";
