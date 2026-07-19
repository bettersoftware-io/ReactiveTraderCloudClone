import { useReducedMotion } from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

/** Whether the shell's idle motion (logo reticle rotation, connection-pulse,
 * dock spring) should run right now: OS reduced-motion off AND power-saver not
 * at the Freeze tier. Gated off ⇒ callers render the static end-state and
 * cancel any repeating worklet (mirrors `useAmbientEnabled` for the ambient
 * background). Freeze is the RN analogue of the web `[data-power-saver=freeze]`
 * catch-all that kills every transition. */
export function useShellMotionEnabled(): boolean {
  const reducedMotion = useReducedMotion();
  const { usePowerSaver } = useViewModel();
  const { isFreeze } = usePowerSaver();
  return !reducedMotion && !isFreeze;
}
