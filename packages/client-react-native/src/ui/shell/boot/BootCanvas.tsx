// packages/client-react-native/src/ui/shell/boot/BootCanvas.tsx
import { Canvas } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useContext, useEffect, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import type { FrameInfo } from "react-native-reanimated";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { BootVariant } from "@rtc/domain";

import { BootClockContext } from "#/ui/shell/boot/BootClockContext";
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
 *
 * A `BootClockContext` pin (the visual harness; `null` in production) takes
 * the frame callback's place: the scene reads the pinned `elapsedSec` and
 * `now`, the callback is never activated, and the gyroscope is never
 * subscribed — so a golden holds one deterministic frame of the real canvas.
 */
export function BootCanvas({ variant }: BootCanvasProps): JSX.Element | null {
  const enabled = useBootMotionEnabled();
  const pin = useContext(BootClockContext);
  const live = enabled && pin === null;
  const { width, height } = useWindowDimensions();
  // Read even under a `BootClockContext` pin: the pin freezes the scene's
  // CLOCK, not the device it runs on, so a golden captured on a Dynamic
  // Island phone correctly shows the top telemetry pushed below the island.
  const insets = useSafeAreaInsets();
  const liveElapsedSec = useSharedValue(0);
  const elapsedSec = pin?.elapsedSec ?? liveElapsedSec;
  const drift = useGyroDrift(live);
  // Read the theme HERE, outside the <Canvas> below: Skia's canvas is a
  // separate reconciler React Context can't cross, so scenes take theme as a
  // prop rather than calling useTheme() themselves. See BootSceneProps.theme.
  const theme = useTheme();

  // A BUILD-ONCE INSTANCE, not tidiness. `useFrameCallback` registers its
  // argument in an effect keyed on `[callback, autostart]`, so an inline arrow
  // — a new identity every render — unregisters and RE-registers the callback
  // on every single render. Re-registration restarts `timeSinceFirstFrame`,
  // and `BootSequence` re-renders on every progress tick, so `elapsedSec` never
  // escaped the first frame or two: every boot scene drew its t=0 frame forever
  // while the progress bar advanced above it. On device that read as an
  // animation stuck flicking between two frames.
  //
  // The `useRef` + `current === null` idiom rather than `useCallback`, which
  // ADR-003 bans; this is an instance the component must hold for its lifetime,
  // not a memoised cache.
  //
  // The `"worklet"` directive is equally load-bearing. The Babel plugin
  // auto-workletizes an INLINE `useFrameCallback` argument; once the function
  // is hoisted into a ref it no longer matches that shape, so without the
  // directive it stays a JS function and the UI runtime throws "Tried to
  // synchronously call a Remote Function" on the first frame. That was observed,
  // not theorised.
  //
  // jest cannot see either half. `jest.setup.ts` stubs `useFrameCallback` with
  // a no-op that never ticks, so the consequence is invisible; and the cause is
  // invisible too, because the official reanimated mock rebuilds its
  // `useSharedValue` Proxy every render, so `elapsedSec` looks unstable under
  // test even though it is stable on device. Pinning that mock is what a
  // regression test needs and is tracked as T31 — the simulator is the witness
  // until then.
  const advanceElapsed = useRef<((frameInfo: FrameInfo) => void) | null>(null);

  if (advanceElapsed.current === null) {
    advanceElapsed.current = (frameInfo: FrameInfo): void => {
      "worklet";
      liveElapsedSec.value = frameInfo.timeSinceFirstFrame / 1000;
    };
  }

  const frameCallback = useFrameCallback(advanceElapsed.current, false);

  // No manual `elapsedSec.value = 0` on toggle: setActive(false) nulls the
  // callback's startTime in Reanimated's registry, so the next activation
  // reports timeSinceFirstFrame from 0 — the clock re-zeroes on re-enable
  // (e.g. reduced-motion lifted mid-boot) without a JS-side write. Re-adding
  // one also re-trips react-hooks/immutability (two shared-value writes gating
  // the same value across the effect).
  useEffect(() => {
    frameCallback.setActive(live);

    return () => {
      frameCallback.setActive(false);
    };
  }, [live, frameCallback]);

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
        topInset={insets.top}
        theme={theme}
        now={pin?.now}
      />
    </Canvas>
  );
}

interface BootCanvasProps {
  readonly variant: BootVariant;
}
