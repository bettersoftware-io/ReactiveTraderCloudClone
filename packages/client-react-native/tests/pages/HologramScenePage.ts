// packages/client-react-native/tests/pages/HologramScenePage.ts
import { HologramSceneHarness } from "#/ui/shell/boot/scenes/HologramSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface HologramSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}

export type HologramScenePage = SceneHarnessPage<HologramSceneHarnessProps>;

/** The framework surface for `HologramScene.test.tsx`. */
export function hologramScenePage(): HologramScenePage {
  return createSceneHarnessPage(HologramSceneHarness, "boot-scene-hologram");
}
