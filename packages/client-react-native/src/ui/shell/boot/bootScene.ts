import type { JSX } from "react";
import type { SharedValue } from "react-native-reanimated";

import type { BootVariant } from "@rtc/domain";

import { CoreScene } from "#/ui/shell/boot/scenes/CoreScene";
import { DockingScene } from "#/ui/shell/boot/scenes/DockingScene";
import { GeoScene } from "#/ui/shell/boot/scenes/GeoScene";
import { HologramScene } from "#/ui/shell/boot/scenes/HologramScene";
import { JarvisScene } from "#/ui/shell/boot/scenes/JarvisScene";
import { LaserScene } from "#/ui/shell/boot/scenes/LaserScene";
import { LayersScene } from "#/ui/shell/boot/scenes/LayersScene";
import { TopoScene } from "#/ui/shell/boot/scenes/TopoScene";
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
  /**
   * Wall-clock instant a scene may print, injected so a capture can pin it.
   *
   * Only `TopoScene` reads it — its footer stamp is the one place any scene
   * shows the real clock. Omitted in production: `BootCanvas` never passes it
   * and the scene falls back to sampling `new Date()` once at mount, which is
   * what a live boot should show.
   *
   * It exists because a live clock was the ONE thing that made a scene
   * ungoldenable — two captures minutes apart differ, so `boot/topo` sat out
   * of `SCENARIO_IDS` entirely. Pinning it keeps the port faithful; the
   * alternative considered was dropping the footer stamp from the scenario,
   * which would have made the golden assert a frame the app never draws.
   */
  readonly now?: Date;
}

export type BootSceneComponent = (props: BootSceneProps) => JSX.Element;

/**
 * Boot variant → scene component. `Partial` by design: **every** variant is now
 * registered — `core`/`laser` (phase 6a), `docking` (6b-1),
 * `hologram` + `layers` (6b-2a) and `geo` + `jarvis` + `topo` (6b-2b). The
 * last five are built on the shared `boot3dCamera` seam.
 *
 * The map stays `Partial` in TYPE even though it is now total in practice.
 * That is deliberate: `BootCanvas`'s "no scene for this variant" fallback is
 * still reachable code with its own test, and narrowing the type would delete
 * that path — leaving a future ninth variant to crash instead of fall back.
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
  jarvis: JarvisScene,
  laser: LaserScene,
  layers: LayersScene,
  topo: TopoScene,
};

/** Reports whether `variant` has a registered scene, without throwing for an
 * unported one. */
export function hasBootScene(variant: BootVariant): boolean {
  return BOOT_SCENES[variant] !== undefined;
}
