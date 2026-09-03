// packages/client-react-native/tests/pages/GeoScenePage.ts
import { GeoSceneHarness } from "#/ui/shell/boot/scenes/GeoSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface GeoSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}

export type GeoScenePage = SceneHarnessPage<GeoSceneHarnessProps>;

/** The framework surface for `GeoScene.test.tsx`. */
export function geoScenePage(): GeoScenePage {
  return createSceneHarnessPage(GeoSceneHarness, "boot-scene-geo");
}
