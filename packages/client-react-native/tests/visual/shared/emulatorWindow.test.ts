import { expect, test } from "vitest";

import { hasWindowedEmulator } from "./emulatorWindow";

test("an emulator started with a window is reported", () => {
  expect(
    hasWindowedEmulator(createProcessList(`${SDK}/qemu-system-aarch64`)),
  ).toBe(true);
});

test("an emulator started with -no-window is not", () => {
  expect(
    hasWindowedEmulator(
      createProcessList(`${SDK}/qemu-system-aarch64-headless`),
    ),
  ).toBe(false);
});

// An Intel Mac runs another binary; the rule is the suffix, not the name.
test("the architecture in the name does not matter", () => {
  expect(
    hasWindowedEmulator(createProcessList(`${SDK}/qemu-system-x86_64`)),
  ).toBe(true);
  expect(
    hasWindowedEmulator(
      createProcessList(`${SDK}/qemu-system-x86_64-headless`),
    ),
  ).toBe(false);
});

test("no emulator at all is not a windowed one", () => {
  expect(hasWindowedEmulator(createProcessList("/usr/bin/some-tool"))).toBe(
    false,
  );
});

// One of each: the windowed one is still there to be throttled.
test("a windowed emulator beside a headless one is reported", () => {
  expect(
    hasWindowedEmulator(
      createProcessList(
        `${SDK}/qemu-system-aarch64-headless`,
        `${SDK}/qemu-system-aarch64`,
      ),
    ),
  ).toBe(true);
});

/** `ps -Ao comm` output: a header, unrelated processes, then `names`. */
function createProcessList(...names: string[]): string {
  return ["COMM", "/sbin/launchd", "/bin/zsh", ...names, ""].join("\n");
}

const SDK = "/Users/me/Library/Android/sdk/emulator/qemu/darwin-aarch64";
