// packages/client-react-native/tests/pages/CoreScenePage.ts
import { CoreSceneHarness } from "#/ui/shell/boot/scenes/CoreSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface CoreSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}

export type CoreScenePage = SceneHarnessPage<CoreSceneHarnessProps>;

/** The framework surface for `CoreScene.test.tsx`. */
export function coreScenePage(): CoreScenePage {
  return createSceneHarnessPage(CoreSceneHarness, "boot-scene-core");
}
