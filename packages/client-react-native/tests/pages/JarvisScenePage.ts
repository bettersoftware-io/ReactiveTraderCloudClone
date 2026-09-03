// packages/client-react-native/tests/pages/JarvisScenePage.ts
import { JarvisSceneHarness } from "#/ui/shell/boot/scenes/JarvisSceneHarness";
import {
  createSceneHarnessPage,
  type SceneHarnessPage,
} from "#tests/pages/support/sceneHarnessPage";

interface JarvisSceneHarnessProps {
  elapsedSec: number;
  mx: number;
  my: number;
}

export type JarvisScenePage = SceneHarnessPage<JarvisSceneHarnessProps>;

/** The framework surface for `JarvisScene.test.tsx`. */
export function jarvisScenePage(): JarvisScenePage {
  return createSceneHarnessPage(JarvisSceneHarness, "boot-scene-jarvis");
}
