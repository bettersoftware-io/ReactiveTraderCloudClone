// packages/client-react-native/tests/pages/LaserScenePage.ts
import { LaserSceneHarness } from "#/ui/shell/boot/scenes/LaserSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface LaserSceneHarnessProps {
  elapsedSec: number;
}

export type LaserScenePage = SceneHarnessPage<LaserSceneHarnessProps>;

/** The framework surface for `LaserScene.test.tsx`. Reuses the shared
 * scene-harness surface as-is: every fact this spec reads (existence,
 * start/end/opacity of a panel/flash/ticks/head node) is already exposed
 * generically by `SceneHarnessPage`, parameterized by the panel-indexed
 * testID the spec builds itself from `LASER_PANELS.length` (a domain
 * constant, not a CSS selector). */
export function laserScenePage(): LaserScenePage {
  return createSceneHarnessPage(LaserSceneHarness, "boot-scene-laser");
}
