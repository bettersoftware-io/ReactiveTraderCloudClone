// packages/client-react-native/src/ui/ambient/useSwingClock.ts
import { useEffect } from "react";
import {
  cancelAnimation,
  type SharedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { EASE_IN_OUT } from "#/ui/ambient/glowSpec";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";

/**
 * A two-keyframe CSS animation as a clock: 0 at the 0% keyframe, 1 at the
 * 50% one, there and back for ever. Each half is one eased segment, as CSS
 * eases 0%→50% and 50%→100% separately.
 *
 * It asks the motion gate itself, so a layer cannot be given a running clock
 * by a caller that forgot to: under power-saver Freeze no loop starts and the
 * clock rests at 0, the layer's 0% keyframe.
 */
export function useSwingClock(cycleMs: number): SharedValue<number> {
  const drifting = useShellMotionEnabled();
  const clock = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(clock);
    clock.value = 0;

    if (!drifting) {
      return;
    }

    clock.value = withRepeat(
      withTiming(1, { duration: cycleMs / 2, easing: EASE_IN_OUT }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(clock);
    };
  }, [drifting, cycleMs, clock]);

  return clock;
}
