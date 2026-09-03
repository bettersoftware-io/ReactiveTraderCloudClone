// packages/client-react-native/tests/pages/DockingScenePage.ts
import { DockingSceneHarness } from "#/ui/shell/boot/scenes/DockingSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface DockingSceneHarnessProps {
  elapsedSec: number;
}

export type DockingScenePage = SceneHarnessPage<DockingSceneHarnessProps>;

/** The framework surface for `DockingScene.test.tsx`. */
export function dockingScenePage(): DockingScenePage {
  return createSceneHarnessPage(DockingSceneHarness, "boot-scene-docking");
}
