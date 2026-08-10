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

import { HIGHLIGHT_DUR_MS, type RankDirection } from "@rtc/motion-core";

/** The movers board's rank-move highlight: a direction-tinted overlay pulse
 * played whenever a row's `rank` changes from the value this hook last saw —
 * `riseColor` when the row moved to a numerically LOWER rank (up the board),
 * `fallColor` when it moved to a higher one. `HIGHLIGHT_DUR_MS` (820ms) is
 * motion-core's §3.2-locked constant — the prototype's own 950ms is a
 * deliberate non-match, kept so RN and web read off one source of truth.
 *
 * DELIBERATELY does NOT call motion-core's `computeRankDirections`: that
 * function derives a symbol's CURRENT rank from its array INDEX in the
 * `order` it's given, and this hook only ever has one row's rank in hand —
 * routing it through as a one-element array pins "current index" at a
 * constant 0, so `oldIndex > index` is unconditionally true and every real
 * rank change reads as "rose". `fallColor` would be unreachable. That
 * function's index-from-order contract is correct for its real (board-level,
 * full-order) callers — the web `useRankGlide` calls it that way — so it's
 * not broken; a single row is simply the wrong shape to route through it. A
 * previous version of this file did exactly that and shipped the bug.
 * `directionFor` below is the direct numeric comparison instead (same rule,
 * inlined at the right arity): lower rank number = "rose", higher = "fell".
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
    const direction = directionFor(prevRankRef.current, rank);

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

// The single-row equivalent of motion-core's `computeRankDirections` rule
// (lower rank number = "rose", higher = "fell", no prior rank or no change =
// "unchanged") — see this file's top doc comment for why that shared helper
// itself is NOT called here.
function directionFor(
  prevRank: number | undefined,
  rank: number,
): RankDirection {
  if (prevRank === undefined || prevRank === rank) {
    return "unchanged";
  }

  return prevRank > rank ? "rose" : "fell";
}
