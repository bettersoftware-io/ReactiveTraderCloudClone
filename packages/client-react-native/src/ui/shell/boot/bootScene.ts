import type { JSX } from "react";
import type { SharedValue } from "react-native-reanimated";

import type { BootVariant } from "@rtc/domain";

import { CoreScene } from "#/ui/shell/boot/scenes/CoreScene";
import { DockingScene } from "#/ui/shell/boot/scenes/DockingScene";
import { GeoScene } from "#/ui/shell/boot/scenes/GeoScene";
import { HologramScene } from "#/ui/shell/boot/scenes/HologramScene";
import { LaserScene } from "#/ui/shell/boot/scenes/LaserScene";
import { LayersScene } from "#/ui/shell/boot/scenes/LayersScene";
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
 * Boot variant → scene component. `Partial` by design: six of eight variants
 * are registered so far — `core` (phase 6a Task 6), `laser` (phase 6a Task 7),
 * `docking` (phase 6b-1 Task 9), `hologram` + `layers` (phase 6b-2a) and `geo`
 * (phase 6b-2b Task 1). The last three are built on the shared
 * `boot3dCamera` seam. `jarvis`/`topo` remain unported, later in 6b-2b.
 *
 * A missing entry is an expected state, never an error: `BootCanvas` looks
 * up the current variant and, finding nothing, renders the chrome-only
 * splash — it must not throw or fall back to a different variant.
 */
export const BOOT_SCENES: Partial<Record<BootVariant, BootSceneComponent>> = {
  core: CoreScene,
  docking: DockingScene,
  geo: GeoScene,
  hologram: HologramScene,
  laser: LaserScene,
  layers: LayersScene,
};

/** Reports whether `variant` has a registered scene, without throwing for an
 * unported one. */
export function hasBootScene(variant: BootVariant): boolean {
  return BOOT_SCENES[variant] !== undefined;
}
