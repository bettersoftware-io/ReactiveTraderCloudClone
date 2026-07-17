import { useReducedMotion } from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

import { resolveAmbientEnabled } from "./resolveAmbientEnabled";

/**
 * Whether the Skia ambient background should be running right now: the
 * animated-background preference (ViewModel seam) ANDed with the absence of
 * the OS-level reduced-motion setting (RN/Reanimated — not a stored
 * preference, per the phase's no-domain-change constraint).
 */
export function useAmbientEnabled(): boolean {
  const { useAnimatedBackground } = useViewModel();
  const { enabled } = useAnimatedBackground();
  const reducedMotion = useReducedMotion();
  return resolveAmbientEnabled(enabled, reducedMotion);
}
