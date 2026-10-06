// packages/client-react-native/src/ui/ambient/AmbientBackground.tsx
import {
  Blur,
  Canvas,
  Circle,
  Group,
  Line,
  vec,
} from "@shopify/react-native-skia";
import { type JSX, type ReactNode, useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

import { AuroraCurtains } from "#/ui/ambient/AuroraCurtains";
import { useAmbientEnabled } from "#/ui/ambient/useAmbientEnabled";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * Ambient background: a full-bleed Skia canvas mounted BEHIND the app's
 * routed content — a faint HUD grid (`t.gridC`, shared) plus ONE of two
 * mutually-exclusive animated layer groups, selected by the `ambientStyle`
 * preference (`useAmbientStyle()`):
 *   - `"rays"` (`testID="ambient-rays-blobs"`) — the original layer: 3 soft
 *     blurred blobs in the active theme's accent colours. It has no
 *     counterpart in the mobile design; its strength is set to read about as
 *     strongly as the aurora.
 *   - `"aurora"` (`testID="ambient-aurora-curtains"`, the default) — the
 *     web client's northern-lights curtains, layer for layer: see
 *     `AuroraCurtains`. From 2026-08 until 2026-10-06 this style drew the
 *     mobile design's two accent washes instead (dc.html:57-58); the owner
 *     asked for the web's look and motion.
 *
 * The rays blobs are not scaled by the skin. Until 2026-10-06 they were
 * multiplied by the per-skin `aurora` intensity (0.1–0.7), which made them
 * read as absent on most skins. The aurora style uses that intensity the way
 * the web does: on its two glow layers only, never on the curtains.
 * Both groups are gated by `useAmbientEnabled()` (the animated-background
 * preference ANDed with OS reduced-motion, unchanged by this style branch);
 * the whole component returns `null` when off, so no worklet or canvas
 * mounts at all — calm-until-real-event per the perf doctrine.
 *
 * The DRIFT is additionally gated by `useShellMotionEnabled()`: under
 * power-saver Freeze the canvas still paints (grid + one static frame of the
 * layer group at its resting pose) but no loop starts — Freeze is the tier
 * that kills every motion. It is also what lets the visual harness capture
 * the ambient layer at all: with the preference on and Freeze seeded, the
 * frame is the same on every capture.
 *
 * Only the active style's loops run: the rays blobs share ONE Reanimated
 * shared value (`progress`, looping 0..1..0), the aurora owns five (one per
 * CSS animation it ports). Skia reads them on the UI thread through
 * `useDerivedValue` — position, scale and skew only, opacity is never
 * animated — so React never re-renders per frame (transform-equivalent only,
 * per docs/performance.md's RN-adapted rule).
 */
export function AmbientBackground(): JSX.Element | null {
  const enabled = useAmbientEnabled();
  const drifting = useShellMotionEnabled();
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const { useAmbientStyle } = useViewModel();
  const { style } = useAmbientStyle();
  const raysDrifting = enabled && drifting && style === "rays";

  useEffect(() => {
    if (!raysDrifting) {
      // Stop the drift loop (toggle off / reduced-motion / Freeze) — the
      // first two return null below, which unmounts the Canvas but would
      // leave a withRepeat(-1) worklet running forever on the UI thread;
      // Freeze keeps the Canvas and shows this resting frame. Cancel and
      // rest at a static frame either way.
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, {
        duration: DRIFT_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(progress);
    };
  }, [raysDrifting, progress]);

  if (!enabled) {
    return null;
  }

  return (
    <Canvas
      testID="ambient-background"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {gridLines(width, height, t.gridC)}
      {style === "rays" ? (
        <TestGroup testID="ambient-rays-blobs">
          {raysBlobSpecs(width, height, t).map((blob) => {
            return <RaysBlob key={blob.id} blob={blob} progress={progress} />;
          })}
        </TestGroup>
      ) : (
        <TestGroup testID="ambient-aurora-curtains">
          <AuroraCurtains
            width={width}
            height={height}
            glowStrength={t.aurora}
            drifting={drifting}
          />
        </TestGroup>
      )}
    </Canvas>
  );
}

/** One leg of the rays blobs' there-and-back loop. */
const DRIFT_DURATION_MS = 13_000;
const GRID_CELL_PX = 56;

interface TestGroupProps {
  readonly testID: string;
  readonly children: ReactNode;
}

/**
 * Thin wrapper around Skia's `<Group>` that also carries a `testID`, so RNTL
 * can distinguish the "rays" vs "aurora" layer groups (`AmbientBackground
 * .test.tsx`). Skia's exported prop types don't declare `testID` — it isn't
 * a Skia concept, and the real `skGroup` intrinsic simply ignores unknown
 * props at runtime — so the prop bag is built as a typed variable rather
 * than an inline JSX literal: TypeScript's excess-property check only fires
 * for object literals passed directly at a typed position, not for a spread
 * from an already-typed variable, so this passes strict `tsc` without an
 * `any`/unsafe cast. In jest, `@shopify/react-native-skia` is fully mocked
 * to plain pass-through host elements (`jest.setup.ts`), so the testID
 * reaches a real queryable node there.
 */
function TestGroup({ testID, children }: TestGroupProps): JSX.Element {
  const testProps = { testID };
  return <Group {...testProps}>{children}</Group>;
}

interface RaysBlobSpec {
  readonly id: string;
  readonly baseX: number;
  readonly baseY: number;
  readonly radius: number;
  /** How far the centre travels over one leg of the loop, in px. */
  readonly drift: number;
  readonly color: string;
  /** Travel direction relative to the shared `progress` value (1 = with it,
   * -1 = against it) — gives each blob a distinct phase off ONE shared
   * animation instead of a second animated value per blob. */
  readonly sign: 1 | -1;
}

interface RaysBlobProps {
  blob: RaysBlobSpec;
  progress: SharedValue<number>;
}

/** A disc blurred at 0.6 × its radius peaks at about three quarters of its
 * own opacity, so 0.18 reads as a soft 13% glow at the centre. */
const RAYS_BLOB_OPACITY = 0.18;
/** Travel per leg as a share of the larger viewport dimension. */
const RAYS_BLOB_DRIFT = 0.1;

/** One blurred "rays"-style circle, its centre derived from the shared
 * `progress` clock — no per-blob animation, just a per-blob phase (`sign`)
 * applied to the one shared value. */
function RaysBlob({ blob, progress }: RaysBlobProps): JSX.Element {
  const cx = useDerivedValue(() => {
    return blob.baseX + blob.sign * (progress.value - 0.5) * blob.drift;
  });

  const cy = useDerivedValue(() => {
    return blob.baseY + blob.sign * (0.5 - progress.value) * blob.drift;
  });

  // A typed variable, for the reason `TestGroup` gives.
  const testProps = { testID: blob.id };

  return (
    <Circle
      {...testProps}
      cx={cx}
      cy={cy}
      r={blob.radius}
      color={blob.color}
      opacity={RAYS_BLOB_OPACITY}
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
function raysBlobSpecs(
  width: number,
  height: number,
  t: RnTheme,
): RaysBlobSpec[] {
  const spread = Math.max(width, height);
  const drift = spread * RAYS_BLOB_DRIFT;
  return [
    {
      id: "rays-1",
      baseX: width * 0.22,
      baseY: height * 0.18,
      radius: spread * 0.32,
      drift,
      color: t.accentPrimary,
      sign: 1,
    },
    {
      id: "rays-2",
      baseX: width * 0.82,
      baseY: height * 0.28,
      radius: spread * 0.28,
      drift,
      color: t.accent2,
      sign: -1,
    },
    {
      id: "rays-3",
      baseX: width * 0.5,
      baseY: height * 0.88,
      radius: spread * 0.3,
      drift,
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
