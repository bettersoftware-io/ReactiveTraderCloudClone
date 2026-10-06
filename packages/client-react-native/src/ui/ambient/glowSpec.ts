// packages/client-react-native/src/ui/ambient/glowSpec.ts
import { Easing } from "react-native-reanimated";

// The data a `GlowLayer` draws, and the two drifts both ambient styles share.

/** A layer's box in canvas px: what its CSS percentages are measured on. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One `radial-gradient(<rx> <ry> at <cx> <cy>, …)`, resolved to canvas px. */
export interface GlowGradient {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly colors: readonly string[];
  readonly positions: readonly number[];
}

/** A glow layer's pose at one keyframe: `translate3d(x%, y%, 0) scale(s)`. */
interface GlowPose {
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
}

/** A two-keyframe drift and the length of its full cycle. */
export interface GlowDrift {
  readonly cycleMs: number;
  readonly from: GlowPose;
  readonly to: GlowPose;
}

export interface GlowSpec {
  readonly id: string;
  readonly box: Box;
  readonly gradients: readonly GlowGradient[];
  readonly drift: GlowDrift;
}

/** The web's `@keyframes aurora-a`, on its 52 s loop. */
export const DRIFT_A: GlowDrift = {
  cycleMs: 52_000,
  from: { tx: -0.07, ty: -0.04, scale: 1.08 },
  to: { tx: 0.07, ty: 0.05, scale: 1.28 },
};

/** The web's `@keyframes aurora-b`, on its 68 s loop. */
export const DRIFT_B: GlowDrift = {
  cycleMs: 68_000,
  from: { tx: 0.06, ty: 0.04, scale: 1.22 },
  to: { tx: -0.06, ty: -0.04, scale: 1.04 },
};

/** CSS `ease-in-out`, which the web applies to each keyframe segment. */
export const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);

/** One gradient of a glow layer from its CSS numbers: radii and centre as
 * shares of `box`, stops as `[colour, position]`. */
export function glowGradient(
  box: Box,
  radii: readonly [number, number],
  centre: readonly [number, number],
  stops: readonly (readonly [string, number])[],
): GlowGradient {
  return {
    cx: box.x + box.w * centre[0],
    cy: box.y + box.h * centre[1],
    rx: box.w * radii[0],
    ry: box.h * radii[1],
    colors: stops.map(([color]) => {
      return color;
    }),
    positions: stops.map(([, position]) => {
      return position;
    }),
  };
}
