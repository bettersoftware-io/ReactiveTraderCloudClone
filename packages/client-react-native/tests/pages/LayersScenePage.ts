// packages/client-react-native/tests/pages/LayersScenePage.ts
import { LayersSceneHarness } from "#/ui/shell/boot/scenes/LayersSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface LayersSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}

export type LayersScenePage = SceneHarnessPage<LayersSceneHarnessProps>;

/** The framework surface for `LayersScene.test.tsx`. */
export function layersScenePage(): LayersScenePage {
  return createSceneHarnessPage(LayersSceneHarness, "boot-scene-layers");
}
