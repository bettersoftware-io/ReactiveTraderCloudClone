import type { JSX } from "react";
import type { SharedValue } from "react-native-reanimated";

import type { BootVariant } from "@rtc/domain";

import { CoreScene } from "#/ui/shell/boot/scenes/CoreScene";
import { LaserScene } from "#/ui/shell/boot/scenes/LaserScene";
import type { GyroDrift } from "#/ui/shell/boot/useGyroDrift";
import type { RnTheme } from "#/ui/theme/tokens";

/**
 * The props every boot scene receives. A types-and-registry module (no
 * components), so it can export the non-component `BOOT_SCENES` map without
 * tripping Biome's `useComponentExportOnlyModules` — the same reason Phase
 * 4b's column ratios live in `blotterColumns.ts` rather than inside a
 * component file.
 */
export interface BootSceneProps {
  /** Seconds since the scene mounted, on the UI thread. */
  readonly elapsedSec: SharedValue<number>;
  /** Normalized gyro drift, −1..1 on both axes — the web's cursor seam.
   * `GyroDrift` is `useGyroDrift`'s own return-value shape, imported rather
   * than duplicated so the two can never drift apart. */
  readonly drift: SharedValue<GyroDrift>;
  readonly width: number;
  readonly height: number;
  /**
   * Resolved theme, passed as a PROP rather than read via `useTheme()` inside
   * the scene. Scenes render inside Skia's `<Canvas>`, which is a separate
   * reconciler that React Context does NOT cross — a `useTheme()` call in a
   * scene body throws "must be used within a ThemeProvider" on a real device
   * (invisible under jest, whose mocked Canvas is a plain context-passing
   * View). `BootCanvas` reads the theme outside the Canvas and threads it in.
   */
  readonly theme: RnTheme;
}

export type BootSceneComponent = (props: BootSceneProps) => JSX.Element;

/**
 * Boot variant → scene component. `Partial` by design: only `core` (Task 6)
 * and `laser` (Task 7) get a scene in phase 6a — the other six variants are
 * intentionally unported until 6b.
 *
 * A missing entry is an expected state, never an error: `BootCanvas` looks
 * up the current variant and, finding nothing, renders the chrome-only
 * splash — it must not throw or fall back to a different variant.
 */
export const BOOT_SCENES: Partial<Record<BootVariant, BootSceneComponent>> = {
  core: CoreScene,
  laser: LaserScene,
};

/** Reports whether `variant` has a registered scene, without throwing for an
 * unported one. */
export function hasBootScene(variant: BootVariant): boolean {
  return BOOT_SCENES[variant] !== undefined;
}
