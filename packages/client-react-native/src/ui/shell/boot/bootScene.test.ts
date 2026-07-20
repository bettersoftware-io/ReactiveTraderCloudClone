import { expect, test } from "vitest";

import { BOOT_VARIANTS } from "@rtc/domain";

import { BOOT_SCENES, hasBootScene } from "#/ui/shell/boot/bootScene";

test("reports no coverage for an unported variant, without throwing", () => {
  expect(() => {
    return hasBootScene("topo");
  }).not.toThrow();
  expect(hasBootScene("topo")).toBe(false);
});

test("returns undefined for an unported variant's registry entry", () => {
  expect(BOOT_SCENES.topo).toBeUndefined();
});

test("every registered key is a real boot variant (guards a typo'd key)", () => {
  const registeredKeys = Object.keys(BOOT_SCENES);

  for (const key of registeredKeys) {
    expect(BOOT_VARIANTS).toContain(key);
  }
});
