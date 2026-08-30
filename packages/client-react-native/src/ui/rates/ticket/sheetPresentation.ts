// packages/client-react-native/src/ui/rates/ticket/sheetPresentation.ts
import type { WithTimingConfig } from "react-native-reanimated";

/** How the trade-ticket sheet should present itself, given whether the shell's
 * motion is on (`useShellMotionEnabled`: OS reduced-motion off AND power-saver
 * below Freeze).
 *
 * Motion off ⇒ the sheet APPEARS rather than slides. Both halves are needed and
 * neither is sufficient alone:
 *
 * - `animateOnMount: false` makes gorhom set the resting position directly
 *   instead of animating to it, and starts `animatedIndex` at the presented
 *   index instead of ramping it from -1 — which is also what stills the
 *   backdrop, whose opacity is interpolated off that same `animatedIndex`, so
 *   the scrim paints at its final opacity with no fade.
 * - `animationConfigs` covers every transition AFTER the mount: the dismiss,
 *   and the height re-animation `enableDynamicSizing` runs whenever the
 *   content re-measures.
 *
 * Motion on ⇒ `undefined`, which leaves the library's own spring defaults
 * untouched. Returning a config here would silently restyle the present for
 * every non-Freeze user. */
export function sheetPresentation(motionEnabled: boolean): SheetPresentation {
  if (motionEnabled) {
    return { animateOnMount: true, animationConfigs: undefined };
  }

  return { animateOnMount: false, animationConfigs: INSTANT_PRESENTATION };
}

export interface SheetPresentation {
  animateOnMount: boolean;
  animationConfigs: WithTimingConfig | undefined;
}

/** `duration: 0` is what makes the transition instant; the key's mere PRESENCE
 * is also what selects gorhom's timing path over its default spring
 * (`@gorhom/bottom-sheet`'s `animate.ts`: `'duration' in configs || 'easing' in
 * configs`), so a spring can never leak back in. */
const INSTANT_PRESENTATION: WithTimingConfig = { duration: 0 };
