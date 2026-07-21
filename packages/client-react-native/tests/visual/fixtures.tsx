import { Canvas } from "@shopify/react-native-skia";
import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

import type { BootSceneComponent } from "#/ui/shell/boot/bootScene";
import { useGyroDrift } from "#/ui/shell/boot/useGyroDrift";
import { HoldToUnlockRing } from "#/ui/shell/lock/HoldToUnlockRing";

/**
 * Component-only module, split out of `scenarios.tsx` so Biome's
 * `useComponentExportOnlyModules` stays happy: that file's primary exports
 * (`SCENARIOS`, `getScenario`) are data/a lookup function, not components, and
 * the rule forbids a file from exporting both a component and a non-component
 * (mirrors why `bootScene.ts` keeps the non-component `BOOT_SCENES` map out of
 * any scene's own file — see its header comment).
 *
 * Both fixtures below exist to pin a Phase 6a boot/lock surface to one
 * deterministic frame instead of mounting it live — see `scenarios.tsx`'s
 * header comment for the full "why a free-running clock can't be a stable
 * golden" rationale.
 */
export function BootSceneFixture({ Scene }: BootSceneFixtureProps): ReactNode {
  const { width, height } = useWindowDimensions();
  const elapsedSec = useSharedValue(BOOT_SCENE_ELAPSED_SEC);
  // `false`: never subscribes to the device gyroscope regardless (see
  // `useGyroDrift`), so `drift` stays centred for the whole capture — the
  // second half of a deterministic pin alongside `elapsedSec`.
  const drift = useGyroDrift(false);

  return (
    <Canvas
      testID="boot-canvas"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Scene
        elapsedSec={elapsedSec}
        drift={drift}
        width={width}
        height={height}
      />
    </Canvas>
  );
}

export function LockHoldFixture(): ReactNode {
  const progress = useSharedValue(LOCK_HOLD_PROGRESS);
  // Built fresh and never triggered: nothing drives a real touch during a
  // static capture, so this only needs to satisfy `HoldToUnlockRing`'s
  // `gesture` prop.
  const gesture = Gesture.LongPress();

  return (
    <HoldToUnlockRing
      gesture={gesture}
      progress={progress}
      onPress={(): void => {}}
    />
  );
}

interface BootSceneFixtureProps {
  readonly Scene: BootSceneComponent;
}

/** A representative mid-boot instant — 60% of `BOOT_DURATION_MS` (4200ms) —
 * pinned as a fixed `elapsedSec` shared value instead of `BootCanvas`'s live
 * `useFrameCallback`. `bootProgress`/`panelRevealFraction` clamp to 0..1
 * internally, so any value strictly between 0 and 4.2 is safe; this one
 * lands well past both scenes' initial reveal windows so the captured frame
 * shows settled geometry, not a blank first frame. */
const BOOT_SCENE_ELAPSED_SEC = 2.52;

/** A representative mid-hold fill — clear of both the empty and the complete
 * edge values, so the golden actually proves the ring's dash-offset math
 * paints a partial arc rather than an all-or-nothing state. */
const LOCK_HOLD_PROGRESS = 0.55;
