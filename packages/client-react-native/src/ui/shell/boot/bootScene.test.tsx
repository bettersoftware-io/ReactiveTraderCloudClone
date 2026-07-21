import { expect, test } from "@jest/globals";

import { BOOT_VARIANTS } from "@rtc/domain";

import { BOOT_SCENES, hasBootScene } from "#/ui/shell/boot/bootScene";

// Jest, not vitest, from Task 6 on: `bootScene.ts` now holds a real value
// import of `CoreScene` (not just the `BootSceneComponent` type), which
// transitively pulls in `@shopify/react-native-skia` and
// `react-native-reanimated` → real `react-native` (Flow syntax) — parseable
// under jest's RN babel transform, not under vitest's plain node/esbuild
// pipeline. `coreGeometry.test.ts` still covers the framework-free math
// under vitest.

test("reports no coverage for an unported variant, without throwing", () => {
  expect(() => {
    return hasBootScene("topo");
  }).not.toThrow();
  expect(hasBootScene("topo")).toBe(false);
});

test("returns undefined for an unported variant's registry entry", () => {
  expect(BOOT_SCENES.topo).toBeUndefined();
});

test("reports coverage for the core variant now that Task 6 registers it", () => {
  expect(hasBootScene("core")).toBe(true);
  expect(BOOT_SCENES.core).toBeDefined();
});

test("reports coverage for the laser variant now that Task 7 registers it", () => {
  expect(hasBootScene("laser")).toBe(true);
  expect(BOOT_SCENES.laser).toBeDefined();
});

test("every registered key is a real boot variant (guards a typo'd key)", () => {
  const registeredKeys = Object.keys(BOOT_SCENES);

  for (const key of registeredKeys) {
    expect(BOOT_VARIANTS).toContain(key);
  }
});
