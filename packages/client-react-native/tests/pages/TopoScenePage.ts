// packages/client-react-native/tests/pages/TopoScenePage.ts
import { TopoSceneHarness } from "#/ui/shell/boot/scenes/TopoSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface TopoSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}

export type TopoScenePage = SceneHarnessPage<TopoSceneHarnessProps>;

/** The framework surface for `TopoScene.test.tsx`. */
export function topoScenePage(): TopoScenePage {
  return createSceneHarnessPage(TopoSceneHarness, "boot-scene-topo");
}
