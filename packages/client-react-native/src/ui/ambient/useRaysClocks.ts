// packages/client-react-native/src/ui/ambient/useRaysClocks.ts
import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { DRIFT_A, DRIFT_B } from "#/ui/ambient/glowSpec";
import { useSwingClock } from "#/ui/ambient/useSwingClock";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";

export interface RaysClocks {
  /** The two glow layers' drifts, 0 at the 0% keyframe and 1 at the 50% one. */
  readonly driftA: SharedValue<number>;
  readonly driftB: SharedValue<number>;
  /** The beam's rotation, 0 to 1 per full turn. */
  readonly turn: SharedValue<number>;
}

/**
 * The rays' three clocks. They run while `active` and the motion gate both
 * allow; otherwise every one rests at 0: the glows at their 0% keyframe, the
 * beam pointing straight up.
 *
 * Called by `AmbientBackground`, outside its Skia canvas, for the reason
 * `useAuroraClocks` gives.
 */
export function useRaysClocks(active: boolean): RaysClocks {
  const running = useShellMotionEnabled() && active;
  const driftA = useSwingClock(DRIFT_A.cycleMs, active);
  const driftB = useSwingClock(DRIFT_B.cycleMs, active);
  const turn = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(turn);
    turn.value = 0;

    if (!running) {
      return;
    }

    turn.value = withRepeat(
      withTiming(1, { duration: SWEEP_TURN_MS, easing: Easing.linear }),
      -1,
    );

    return () => {
      cancelAnimation(turn);
    };
  }, [running, turn]);

  return { driftA, driftB, turn };
}

/** One full turn of the beam. */
const SWEEP_TURN_MS = 90_000;
