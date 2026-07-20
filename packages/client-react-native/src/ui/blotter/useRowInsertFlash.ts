import { useEffect, useRef } from "react";
import type { ViewStyle } from "react-native";
import {
  type AnimatedStyle,
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Prototype blotter row-insert flash: rise `translateY -6 → 0`, fade
 * `opacity 0.4 → 1`, and a direction-tinted background wash — `flashColor` at
 * ~30% alpha, down to ~18% at the 35% mark, then resting on the row's own
 * opaque `baseColor` — all over 950ms with `cubic-bezier(0.2, 0.8, 0.3, 1)`
 * (`dc.html` L861-881).
 *
 * The resting stop is `baseColor`, not `"transparent"`, on purpose: a CSS
 * keyframe animation with no fill-mode simply stops applying and the
 * underlying `background` reappears, but a Reanimated `useAnimatedStyle`
 * returns a style every frame forever, including at rest — so "revert to the
 * stylesheet value" has to be expressed explicitly, or the animated style's
 * `backgroundColor` permanently shadows the caller's own opaque background. */
const FLASH_DURATION_MS = 950;
const FLASH_EASING = Easing.bezier(0.2, 0.8, 0.3, 1);
const FLASH_MID_STOP = 0.35;
const RISE_FROM = -6;
const OPACITY_FROM = 0.4;
// Hex alpha suffixes appended to a 6-digit `#RRGGBB` theme colour (RN
// supports 8-digit `#RRGGBBAA`): 0x4D ≈ 30%, 0x2E ≈ 18%.
const ALPHA_START_HEX = "4D";
const ALPHA_MID_HEX = "2E";

export interface RowInsertFlashHandle {
  flashStyle: AnimatedStyle<ViewStyle>;
}

/** Plays the row-insert flash once when `isNew` rises to `true` while
 * `enabled`; gated off (reduced-motion or power-saver Freeze via
 * `useShellMotionEnabled`) returns the static end-state — no rise, full
 * opacity, `baseColor` background — and cancels any running animation.
 * `baseColor` is a required, explicit param (never defaulted) so this hook
 * stays generic and each caller states its own resting background. */
export function useRowInsertFlash(
  isNew: boolean,
  flashColor: string,
  baseColor: string,
  enabled: boolean,
): RowInsertFlashHandle {
  const progress = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const playedRef = useRef(false);

  // A single effect (rather than one per concern) so the insert-triggered
  // play and the enabled-gate reset apply to the shared values in one
  // deterministic order per commit — mirrors useTickFlash's pulse effect.
  useEffect(() => {
    if (!enabled) {
      cancelAnimation(progress);
      cancelAnimation(translateY);
      cancelAnimation(opacity);
      progress.value = 1;
      translateY.value = 0;
      opacity.value = 1;
      return;
    }

    if (!isNew) {
      playedRef.current = false;
      return;
    }

    if (playedRef.current) {
      return;
    }

    playedRef.current = true;

    progress.value = 0;
    translateY.value = RISE_FROM;
    opacity.value = OPACITY_FROM;
    progress.value = withTiming(1, {
      duration: FLASH_DURATION_MS,
      easing: FLASH_EASING,
    });
    translateY.value = withTiming(0, {
      duration: FLASH_DURATION_MS,
      easing: FLASH_EASING,
    });
    opacity.value = withTiming(1, {
      duration: FLASH_DURATION_MS,
      easing: FLASH_EASING,
    });
  }, [isNew, enabled, progress, translateY, opacity]);

  return {
    flashStyle: useAnimatedStyle<ViewStyle>(() => {
      return {
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
        backgroundColor: interpolateColor(
          progress.value,
          [0, FLASH_MID_STOP, 1],
          [
            `${flashColor}${ALPHA_START_HEX}`,
            `${flashColor}${ALPHA_MID_HEX}`,
            baseColor,
          ],
        ),
      };
    }),
  };
}
