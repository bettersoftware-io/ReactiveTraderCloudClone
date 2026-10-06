// packages/client-react-native/src/ui/ambient/AmbientBackground.tsx
import {
  Blur,
  Canvas,
  Circle,
  Group,
  Line,
  RadialGradient,
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

import { useAmbientEnabled } from "#/ui/ambient/useAmbientEnabled";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { withAlpha } from "#/ui/theme/withAlpha";

/**
 * Ambient background: a full-bleed Skia canvas mounted BEHIND the app's
 * routed content — a faint HUD grid (`t.gridC`, shared) plus ONE of two
 * mutually-exclusive animated layer groups, selected by the `ambientStyle`
 * preference (`useAmbientStyle()`):
 *   - `"rays"` (`testID="ambient-rays-blobs"`) — the original layer: 3 soft
 *     blurred blobs in the active theme's accent colours. It has no
 *     counterpart in the mobile design; its strength is set to read about as
 *     strongly as the aurora.
 *   - `"aurora"` (`testID="ambient-aurora-wash"`, the default) — the mobile
 *     design's own ambient (dc.html:57-58): two theme-accent radial washes,
 *     `accentPrimary` across the top and `accent2` rising from the bottom,
 *     each an elliptical `radial-gradient(... 0%, transparent 62%)` at the
 *     design's 0.13/0.10 opacities, drifting between the design's two
 *     keyframe poses (`kfAuroraA`/`B`). The web client keeps its own curtains;
 *     this layer answers to the mobile prototype.
 *
 * Neither layer is scaled by the skin. Until 2026-10-06 both were multiplied
 * by a per-skin `aurora` intensity (0.1–0.7), which put the washes at 1–9%
 * opacity and made the layer read as absent on most skins. The design defines
 * that number per skin and never applies it to the washes, so it is gone.
 * Both groups are gated by `useAmbientEnabled()` (the animated-background
 * preference ANDed with OS reduced-motion, unchanged by this style branch);
 * the whole component returns `null` when off, so no worklet or canvas
 * mounts at all — calm-until-real-event per the perf doctrine.
 *
 * The DRIFT is additionally gated by `useShellMotionEnabled()`: under
 * power-saver Freeze the canvas still paints (grid + one static frame of the
 * layer group at `progress = 0`) but the loop never starts — Freeze is the
 * tier that kills every motion, and this was the one worklet it did not
 * reach. It is also what lets the visual harness capture the ambient layer
 * at all: with the preference on and Freeze seeded, the frame is the same on
 * every capture.
 *
 * Drift is exactly ONE Reanimated shared value (`progress`, looping 0..1..0
 * via `withRepeat`+`withTiming` on the UI thread), read by every layer
 * (blob `cx`/`cy`, wash `transform`) through `useDerivedValue` — position
 * and scale only; opacity is static, never animated. One
 * underlying animation drives the whole canvas regardless of style; Skia
 * reads the shared values directly on the UI thread, so React never
 * re-renders per frame (transform-equivalent only, per docs/performance.md's
 * RN-adapted rule).
 */
export function AmbientBackground(): JSX.Element | null {
  const enabled = useAmbientEnabled();
  const drifting = useShellMotionEnabled();
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const { useAmbientStyle } = useViewModel();
  const { style } = useAmbientStyle();

  useEffect(() => {
    if (!enabled || !drifting) {
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
  }, [enabled, drifting, progress]);

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
        <TestGroup testID="ambient-aurora-wash">
          {auroraWashSpecs(width, height, t).map((wash) => {
            return (
              <AuroraWashBlob key={wash.id} wash={wash} progress={progress} />
            );
          })}
        </TestGroup>
      )}
    </Canvas>
  );
}

/** One leg of the there-and-back loop: the design's `kfAuroraA` runs a full
 * cycle in 26 s (`kfAuroraB` in 31 s — one clock stands in for both). */
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
 * own opacity, so 0.18 lands near the aurora's 0.13 peak. */
const RAYS_BLOB_OPACITY = 0.18;
/** Travel per leg as a share of the larger viewport dimension — the same
 * order as the aurora's keyframe travel. */
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

interface AuroraWashSpec {
  readonly id: string;
  /** Ellipse centre + radii, in canvas px (already scaled from the design's
   * percentage geometry — see `auroraWashSpecs`). */
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly color: string;
  /** The design's per-wash opacity (0.13 top / 0.10 bottom). */
  readonly opacity: number;
  /** The wash's pose at the two ends of the loop — the design's 0% and 50%
   * keyframes, as an offset from the centre in px and a scale. */
  readonly from: AuroraWashPose;
  readonly to: AuroraWashPose;
}

interface AuroraWashPose {
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
}

interface AuroraWashBlobProps {
  wash: AuroraWashSpec;
  progress: SharedValue<number>;
}

/** CSS `radial-gradient(ellipse at center, …)` sizes its 100% against the
 * FARTHEST CORNER by default — √2× the half-size for a centre-anchored
 * ellipse — so the design's `transparent 62%` stop reaches well past the
 * blob's nominal radii. Drawing the unit gradient at r=√2 reproduces that
 * reach; without it the wash measured ~3× too faint at the sampled
 * mid-falloff points of the reference shots. */
const WASH_GRADIENT_REACH: number = Math.SQRT2;

/** One accent wash: a unit circle carrying the design's
 * `radial-gradient(ellipse at center, colour 0%, transparent 62%)`
 * (dc.html:57-58), scaled into its ellipse by the group transform so the
 * gradient stays elliptical. The gradient's own alpha ramp does the
 * softening — no `<Blur>` pass, so the layer stays one cheap draw. The pose
 * is interpolated between the wash's two keyframes off the shared progress
 * clock; at rest (`progress = 0`) it is the design's 0% keyframe. */
function AuroraWashBlob({ wash, progress }: AuroraWashBlobProps): JSX.Element {
  const transform = useDerivedValue(() => {
    const p = progress.value;
    const scale = wash.from.scale + (wash.to.scale - wash.from.scale) * p;
    return [
      { translateX: wash.cx + wash.from.dx + (wash.to.dx - wash.from.dx) * p },
      { translateY: wash.cy + wash.from.dy + (wash.to.dy - wash.from.dy) * p },
      { scaleX: wash.rx * scale },
      { scaleY: wash.ry * scale },
    ];
  });

  // A typed variable, for the reason `TestGroup` gives.
  const testProps = { testID: wash.id };

  return (
    <Group transform={transform}>
      <Circle
        {...testProps}
        cx={0}
        cy={0}
        r={WASH_GRADIENT_REACH}
        opacity={wash.opacity}
      >
        <RadialGradient
          c={vec(0, 0)}
          r={WASH_GRADIENT_REACH}
          colors={[wash.color, withAlpha(wash.color, 0)]}
          positions={[0, 0.62]}
        />
      </Circle>
    </Group>
  );
}

/** The design's two washes (dc.html:57-58), percentage geometry resolved to
 * canvas px: `accentPrimary` as a 130%×60% ellipse whose centre sits 12% down
 * (`left:-15%;top:-18%`), `accent2` as a 120%×55% ellipse centred 5.5% below
 * the bottom edge (`left:-10%;bottom:-22%`). The transparent stop is the
 * wash's own colour at alpha 0, so the fade does not pass through grey.
 *
 * The poses are `kfAuroraA`/`kfAuroraB` (dc.html:43-44). A CSS `translate(x%,
 * y%)` is a share of the element's OWN box, which is twice each radius here. */
function auroraWashSpecs(
  width: number,
  height: number,
  t: RnTheme,
): AuroraWashSpec[] {
  return [
    {
      id: "aurora-wash-top",
      cx: width * 0.5,
      cy: height * 0.12,
      rx: width * 0.65,
      ry: height * 0.3,
      color: t.accentPrimary,
      opacity: 0.13,
      from: { dx: width * 1.3 * -0.12, dy: height * 0.6 * -0.06, scale: 1 },
      to: { dx: width * 1.3 * 0.1, dy: height * 0.6 * 0.08, scale: 1.18 },
    },
    {
      id: "aurora-wash-bottom",
      cx: width * 0.5,
      cy: height * 0.945,
      rx: width * 0.6,
      ry: height * 0.275,
      color: t.accent2,
      opacity: 0.1,
      from: { dx: width * 1.2 * 0.14, dy: height * 0.55 * 0.1, scale: 1.1 },
      to: { dx: width * 1.2 * -0.08, dy: height * 0.55 * -0.1, scale: 0.95 },
    },
  ];
}

/** Evenly spaced HUD grid/** Evenly spaced HUD grid lines (vertical + horizontal) at `GRID_CELL_PX`
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
