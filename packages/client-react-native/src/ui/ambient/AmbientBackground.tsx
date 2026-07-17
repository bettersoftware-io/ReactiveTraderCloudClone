// packages/client-react-native/src/ui/ambient/AmbientBackground.tsx
import { Blur, Canvas, Circle, Line, vec } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useAmbientEnabled } from "#/ui/ambient/useAmbientEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

const DRIFT_DURATION_MS = 18_000;
const GRID_CELL_PX = 56;
const BLOB_BASE_OPACITY = 0.35;
const BLOB_DRIFT_PX = 36;

interface AuroraBlobSpec {
  readonly id: string;
  readonly baseX: number;
  readonly baseY: number;
  readonly radius: number;
  readonly color: string;
  /** Travel direction relative to the shared `progress` value (1 = with it,
   * -1 = against it) — gives each blob a distinct phase off ONE shared
   * animation instead of a second animated value per blob. */
  readonly sign: 1 | -1;
}

/**
 * Ambient background: a full-bleed Skia canvas mounted BEHIND the app's
 * routed content — 3 soft blurred aurora blobs (theme accent colours,
 * opacity scaled by `t.aurora`) plus a faint HUD grid (`t.gridC`). Gated on
 * `useAmbientEnabled()` (the animated-background preference ANDed with OS
 * reduced-motion); returns `null` when off, so no worklet or canvas mounts at
 * all — calm-until-real-event per the perf doctrine.
 *
 * Drift is exactly ONE Reanimated shared value (`progress`, looping 0..1..0
 * via `withRepeat`+`withTiming` on the UI thread), read by each blob's
 * `cx`/`cy` through `useDerivedValue` — position only; opacity is static
 * (pre-scaled by `t.aurora`, never animated). One underlying animation drives
 * the whole canvas; Skia reads the shared values directly on the UI thread,
 * so React never re-renders per frame (transform-equivalent only, per
 * docs/performance.md's RN-adapted rule).
 */
export function AmbientBackground(): JSX.Element | null {
  const enabled = useAmbientEnabled();
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: DRIFT_DURATION_MS }),
      -1,
      true,
    );
  }, [enabled, progress]);

  if (!enabled) {
    return null;
  }

  const blobs = auroraBlobs(width, height, t);

  return (
    <Canvas
      testID="ambient-background"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {gridLines(width, height, t.gridC)}
      {blobs.map((blob) => {
        return (
          <AuroraBlob
            key={blob.id}
            blob={blob}
            progress={progress}
            aurora={t.aurora}
          />
        );
      })}
    </Canvas>
  );
}

interface AuroraBlobProps {
  blob: AuroraBlobSpec;
  progress: SharedValue<number>;
  aurora: number;
}

/** One blurred aurora circle, its centre derived from the shared `progress`
 * clock — no per-blob animation, just a per-blob phase (`sign`) applied to the
 * one shared value. */
function AuroraBlob({ blob, progress, aurora }: AuroraBlobProps): JSX.Element {
  const cx = useDerivedValue(() => {
    return blob.baseX + blob.sign * (progress.value - 0.5) * BLOB_DRIFT_PX;
  });
  const cy = useDerivedValue(() => {
    return blob.baseY + blob.sign * (0.5 - progress.value) * BLOB_DRIFT_PX;
  });

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={blob.radius}
      color={blob.color}
      opacity={BLOB_BASE_OPACITY * aurora}
    >
      <Blur blur={blob.radius * 0.6} />
    </Circle>
  );
}

/** Three blobs spread toward the canvas corners/base, sized relative to the
 * larger viewport dimension so they read consistently across phone sizes.
 * Colours reuse existing theme accents (no new theme tokens): `accentPrimary`,
 * `accent2`, and `glowC` (falling back to `accentPrimary` for skins where
 * `glowC` is `null`). */
function auroraBlobs(
  width: number,
  height: number,
  t: RnTheme,
): AuroraBlobSpec[] {
  const spread = Math.max(width, height);
  return [
    {
      id: "aurora-1",
      baseX: width * 0.22,
      baseY: height * 0.18,
      radius: spread * 0.32,
      color: t.accentPrimary,
      sign: 1,
    },
    {
      id: "aurora-2",
      baseX: width * 0.82,
      baseY: height * 0.28,
      radius: spread * 0.28,
      color: t.accent2,
      sign: -1,
    },
    {
      id: "aurora-3",
      baseX: width * 0.5,
      baseY: height * 0.88,
      radius: spread * 0.3,
      color: t.glowC ?? t.accentPrimary,
      sign: 1,
    },
  ];
}

/** Evenly spaced HUD grid lines (vertical + horizontal) at `GRID_CELL_PX`
 * spacing, in the theme's low-alpha `gridC` colour. */
function gridLines(
  width: number,
  height: number,
  color: string,
): JSX.Element[] {
  const lines: JSX.Element[] = [];

  for (let x = GRID_CELL_PX; x < width; x += GRID_CELL_PX) {
    lines.push(
      <Line
        key={`grid-v-${x}`}
        p1={vec(x, 0)}
        p2={vec(x, height)}
        color={color}
        strokeWidth={1}
      />,
    );
  }

  for (let y = GRID_CELL_PX; y < height; y += GRID_CELL_PX) {
    lines.push(
      <Line
        key={`grid-h-${y}`}
        p1={vec(0, y)}
        p2={vec(width, y)}
        color={color}
        strokeWidth={1}
      />,
    );
  }

  return lines;
}
