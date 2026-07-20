import { useReducedMotion } from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

import { resolveBootMotionEnabled } from "./resolveBootMotionEnabled";

/** Live wiring for {@link resolveBootMotionEnabled}. */
export function useBootMotionEnabled(): boolean {
  const { usePowerSaver, useForceBootAnimation } = useViewModel();
  const { isFreeze } = usePowerSaver();
  const { enabled: forced } = useForceBootAnimation();
  const reducedMotion = useReducedMotion();
  return resolveBootMotionEnabled(reducedMotion, isFreeze, forced);
}
