import { useEffect, useRef } from "react";
import type { ViewStyle } from "react-native";
import {
  type AnimatedStyle,
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { nextTickFlash, type TickFlashState } from "@rtc/motion-core";

/** Prototype pips-pop: `scale 1.22 → 1` over 240ms, `cubic-bezier(0.2,0.9,0.3,1)`
 * (`dc.html` L856-859). Split into two 120ms halves. */
const POP_SCALE = 1.22;
const POP_HALF_MS = 120;
const POP_EASING = Easing.bezier(0.2, 0.9, 0.3, 1);

export interface TickFlashHandle {
  flashStyle: AnimatedStyle<ViewStyle>;
}

export function useTickFlash(value: number, enabled: boolean): TickFlashHandle {
  const scale = useSharedValue(1);
  const stateRef = useRef<TickFlashState>({ value: null, nonce: 0 });
  const nonceRef = useRef(0);

  // A single effect (rather than one per concern) so both the tick-triggered
  // pop and the enabled-gate reset apply to `scale` in one deterministic
  // order per commit — mirrors ShellHeader's pulse effect.
  useEffect(() => {
    const result = nextTickFlash(stateRef.current, value);
    stateRef.current = result.state;
    const isNewTick = result.state.nonce !== nonceRef.current;

    if (isNewTick) {
      nonceRef.current = result.state.nonce;
    }

    if (!enabled) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }

    if (isNewTick) {
      scale.value = withSequence(
        withTiming(POP_SCALE, { duration: POP_HALF_MS, easing: POP_EASING }),
        withTiming(1, { duration: POP_HALF_MS, easing: POP_EASING }),
      );
    }
  }, [value, enabled, scale]);

  return {
    flashStyle: useAnimatedStyle<ViewStyle>(() => {
      return { transform: [{ scale: scale.value }] };
    }),
  };
}
