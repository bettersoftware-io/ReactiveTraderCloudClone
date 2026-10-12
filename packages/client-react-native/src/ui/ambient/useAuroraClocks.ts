// packages/client-react-native/src/ui/ambient/useAuroraClocks.ts
import { useEffect } from "react";
import {
  cancelAnimation,
  type SharedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { DRIFT_A, DRIFT_B, EASE_IN_OUT } from "#/ui/ambient/glowSpec";
import { useSwingClock } from "#/ui/ambient/useSwingClock";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";

/** One clock per CSS animation the aurora ports: `aurora-a` … `aurora-e`. */
export type AuroraClock = "a" | "b" | "c" | "d" | "e";

export type AuroraClocks = Readonly<Record<AuroraClock, SharedValue<number>>>;

/**
 * The aurora's five clocks. They run while `active` and the motion gate both
 * allow; otherwise every one rests at 0, the layers' 0% keyframe.
 *
 * Called by `AmbientBackground`, OUTSIDE its Skia canvas: the canvas renders
 * its children in a tree of its own, which React context does not reach, so a
 * hook that reads the view model (the motion gate does) throws in there.
 */
export function useAuroraClocks(active: boolean): AuroraClocks {
  const running = useShellMotionEnabled() && active;
  const a = useSwingClock(DRIFT_A.cycleMs, active);
  const b = useSwingClock(DRIFT_B.cycleMs, active);
  const c = useSwingClock(CURTAIN_CYCLE_MS.c, active);
  const d = useSwingClock(CURTAIN_CYCLE_MS.d, active);
  const e = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(e);
    e.value = 0;

    if (!running) {
      return;
    }

    e.value = withRepeat(
      withSequence(
        ...E_SEGMENTS.map((share, index) => {
          return withTiming(index + 1, {
            duration: CURTAIN_CYCLE_MS.e * share,
            easing: EASE_IN_OUT,
          });
        }),
        // Back to the start of the cycle in no time: the 100% keyframe is
        // the 0% keyframe, so the wrap does not show.
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );

    return () => {
      cancelAnimation(e);
    };
  }, [running, e]);

  return { a, b, c, d, e };
}

/** Full-cycle durations of the three curtain animations, in ms; the two
 * glow layers carry their own (`DRIFT_A`, `DRIFT_B`). */
const CURTAIN_CYCLE_MS = { c: 44_000, d: 61_000, e: 27_000 } as const;

/** `aurora-e` is the one animation with four keyframes (0/33/66/100%), so its
 * clock runs 0→1→2→3 and wraps; the other four swing 0→1→0. */
const E_SEGMENTS: readonly number[] = [0.33, 0.33, 0.34];
