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

import { computeRankDirections, HIGHLIGHT_DUR_MS } from "@rtc/motion-core";

/** The movers board's rank-move highlight: a direction-tinted overlay pulse
 * played whenever a row's `rank` changes from the value this hook last saw —
 * `riseColor` when the row moved to a numerically LOWER rank (up the board),
 * `fallColor` when it moved to a higher one. The rose/fell classification
 * itself is motion-core's `computeRankDirections` (same function the web
 * `useRankGlide` calls) rather than a re-implemented comparison, called
 * against a single-row order so the maths stays in one place per ADR-005.
 * `HIGHLIGHT_DUR_MS` (820ms) is motion-core's §3.2-locked constant — the
 * prototype's own 950ms is a deliberate non-match, kept so RN and web read
 * off one source of truth.
 *
 * This hook only plays the highlight PULSE. The row's actual position glide
 * is handled for free by the caller's `Animated.View` carrying
 * `layout={LinearTransition...}` — Reanimated re-measures and glides a view
 * automatically when its render position changes, so there is no DOM-style
 * measuring/coalescing step to shell here (unlike the web hook, which drives
 * WAAPI directly against measured DOM nodes).
 *
 * `enabled=false` (reduced motion or power-saver Freeze, via
 * `useShellMotionEnabled`) cancels any in-flight pulse and holds opacity at
 * 0 — no flash at all, matching the web hook's freeze/reduced-motion gate. */
export function useRankMoveGlide(
  rank: number,
  riseColor: string,
  fallColor: string,
  enabled: boolean,
): RankMoveGlideHandle {
  const opacity = useSharedValue(0);
  const tint = useSharedValue(riseColor);
  const prevRankRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const prevRank = prevRankRef.current;
    const prevOrder =
      prevRank === undefined ? undefined : { [RANK_GLIDE_ROW_KEY]: prevRank };

    const direction = computeRankDirections(prevOrder, [RANK_GLIDE_ROW_KEY])[
      RANK_GLIDE_ROW_KEY
    ];

    prevRankRef.current = rank;

    if (!enabled) {
      cancelAnimation(opacity);
      opacity.value = 0;
      return;
    }

    if (direction === "unchanged") {
      return;
    }

    tint.value = direction === "rose" ? riseColor : fallColor;
    opacity.value = withSequence(
      withTiming(OVERLAY_PEAK_OPACITY, {
        duration: HIGHLIGHT_DUR_MS * HIGHLIGHT_HOLD_RATIO,
        easing: Easing.linear,
      }),
      withTiming(0, {
        duration: HIGHLIGHT_DUR_MS * (1 - HIGHLIGHT_HOLD_RATIO),
        easing: HIGHLIGHT_FADE_EASING,
      }),
    );
  }, [rank, riseColor, fallColor, enabled, opacity, tint]);

  return {
    overlayStyle: useAnimatedStyle<ViewStyle>(() => {
      return { opacity: opacity.value, backgroundColor: tint.value };
    }),
  };
}

export interface RankMoveGlideHandle {
  overlayStyle: AnimatedStyle<ViewStyle>;
}

// Mirrors the web `playHighlight` keyframe's 0 → 0.3 hold-at-peak offset
// before easing out to 0 over the rest of `HIGHLIGHT_DUR_MS`.
const HIGHLIGHT_HOLD_RATIO = 0.3;
// Reanimated has no CSS-string easing input, so motion-core's HIGHLIGHT_EASING
// ("ease-out") is translated once here to its closest built-in analogue —
// same technique as useTickFlash's local POP_EASING.
const HIGHLIGHT_FADE_EASING = Easing.out(Easing.ease);
// A flat theme colour at full opacity would blank out the row's own text;
// capped well below 1 so the pulse tints rather than obscures — same
// technique as Watchlist/SectorHeatmap's `heat` overlay.
const OVERLAY_PEAK_OPACITY = 0.35;
// computeRankDirections operates on a whole symbol order; this hook only
// ever asks it about the one row it owns, so a single stable key stands in
// for that row's "order".
const RANK_GLIDE_ROW_KEY = "row";
