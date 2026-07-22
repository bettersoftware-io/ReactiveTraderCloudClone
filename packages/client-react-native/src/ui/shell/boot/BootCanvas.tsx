// packages/client-react-native/src/ui/shell/boot/BootCanvas.tsx
import { Canvas } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";

import type { BootVariant } from "@rtc/domain";

import { BOOT_SCENES } from "#/ui/shell/boot/bootScene";
import { useBootMotionEnabled } from "#/ui/shell/boot/useBootMotionEnabled";
import { useGyroDrift } from "#/ui/shell/boot/useGyroDrift";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * The Skia host for the boot splash's motion scenes: a single full-bleed
 * `<Canvas>` mounted behind the boot chrome (SKIP button etc., which sits
 * above it — hence `pointerEvents="none"`), owning the one `elapsedSec`
 * shared value every scene animates off of and looking up which scene
 * (Task 4's `BOOT_SCENES`) to render for the current boot variant.
 *
 * Follows `AmbientBackground`'s gate shape: `elapsedSec` is advanced by
 * `useFrameCallback` — real UI-side timers, not a JS-thread interval — and
 * an effect keeps the frame callback's active state in lockstep with
 * `enabled`, so while boot motion is disabled (reduced motion, Freeze
 * power-saver, or simply no scene ported for this variant yet) it stops
 * ticking and the component returns `null`, so no `<Canvas>` mounts at all.
 * A missing scene (Tasks 6/7 haven't registered it, or the variant is one of
 * the six deferred to phase 6b) is an expected, silent no-op — never a
 * thrown error or a substituted variant.
 */
export function BootCanvas({ variant }: BootCanvasProps): JSX.Element | null {
  const enabled = useBootMotionEnabled();
  const { width, height } = useWindowDimensions();
  const elapsedSec = useSharedValue(0);
  const drift = useGyroDrift(enabled);
  // Read the theme HERE, outside the <Canvas> below: Skia's canvas is a
  // separate reconciler React Context can't cross, so scenes take theme as a
  // prop rather than calling useTheme() themselves. See BootSceneProps.theme.
  const theme = useTheme();

  const frameCallback = useFrameCallback((frameInfo) => {
    elapsedSec.value = frameInfo.timeSinceFirstFrame / 1000;
  }, false);

  // No manual `elapsedSec.value = 0` on toggle: setActive(false) nulls the
  // callback's startTime in Reanimated's registry, so the next activation
  // reports timeSinceFirstFrame from 0 — the clock re-zeroes on re-enable
  // (e.g. reduced-motion lifted mid-boot) without a JS-side write. Re-adding
  // one also re-trips react-hooks/immutability (two shared-value writes gating
  // the same value across the effect).
  useEffect(() => {
    frameCallback.setActive(enabled);

    return () => {
      frameCallback.setActive(false);
    };
  }, [enabled, frameCallback]);

  if (!enabled) {
    return null;
  }

  const Scene = BOOT_SCENES[variant];

  if (Scene === undefined) {
    return null;
  }

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
        theme={theme}
      />
    </Canvas>
  );
}

interface BootCanvasProps {
  readonly variant: BootVariant;
}
