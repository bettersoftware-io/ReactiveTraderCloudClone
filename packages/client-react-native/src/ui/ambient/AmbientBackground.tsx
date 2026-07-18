// packages/client-react-native/src/ui/ambient/AmbientBackground.tsx
import {
  Blur,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  Rect,
  vec,
} from "@shopify/react-native-skia";
import type { JSX, ReactNode } from "react";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  cancelAnimation,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

import { useAmbientEnabled } from "#/ui/ambient/useAmbientEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * Ambient background: a full-bleed Skia canvas mounted BEHIND the app's
 * routed content — a faint HUD grid (`t.gridC`, shared) plus ONE of two
 * mutually-exclusive animated layer groups, selected by the `ambientStyle`
 * preference (`useAmbientStyle()`):
 *   - `"rays"` (`testID="ambient-rays-blobs"`) — the original layer: 3 soft
 *     blurred blobs in the active theme's accent colours.
 *   - `"aurora"` (`testID="ambient-aurora-curtains"`) — northern-lights
 *     curtains: 3 blurred vertical gradient bands on a FIXED palette (not
 *     theme-tinted, matching the web `AmbientBackground.module.css` aurora
 *     stops), approximating the web version's `repeating-linear-gradient` +
 *     CSS mask "comb" — see `AuroraCurtainBand` for the exact deviation.
 * Both groups are gated by `useAmbientEnabled()` (the animated-background
 * preference ANDed with OS reduced-motion, unchanged by this style branch);
 * the whole component returns `null` when off, so no worklet or canvas
 * mounts at all — calm-until-real-event per the perf doctrine.
 *
 * Drift is exactly ONE Reanimated shared value (`progress`, looping 0..1..0
 * via `withRepeat`+`withTiming` on the UI thread), read by every layer
 * (blob `cx`/`cy`, curtain `transform`) through `useDerivedValue` — position
 * only; opacity is static (pre-scaled by `t.aurora`, never animated). One
 * underlying animation drives the whole canvas regardless of style; Skia
 * reads the shared values directly on the UI thread, so React never
 * re-renders per frame (transform-equivalent only, per docs/performance.md's
 * RN-adapted rule).
 */
export function AmbientBackground(): JSX.Element | null {
  const enabled = useAmbientEnabled();
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const { useAmbientStyle } = useViewModel();
  const { style } = useAmbientStyle();

  useEffect(() => {
    if (!enabled) {
      // Stop the drift loop (toggle off / reduced-motion) — returning null
      // below unmounts the Canvas but would leave a withRepeat(-1) worklet
      // running forever on the UI thread. Cancel and rest at a static frame.
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, { duration: DRIFT_DURATION_MS }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(progress);
    };
  }, [enabled, progress]);

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
            return (
              <RaysBlob
                key={blob.id}
                blob={blob}
                progress={progress}
                aurora={t.aurora}
              />
            );
          })}
        </TestGroup>
      ) : (
        <TestGroup testID="ambient-aurora-curtains">
          {auroraCurtainSpecs(width, height).map((band) => {
            return (
              <AuroraCurtainBand
                key={band.id}
                band={band}
                progress={progress}
                aurora={t.aurora}
              />
            );
          })}
        </TestGroup>
      )}
    </Canvas>
  );
}

const DRIFT_DURATION_MS = 18_000;
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
  readonly color: string;
  /** Travel direction relative to the shared `progress` value (1 = with it,
   * -1 = against it) — gives each blob a distinct phase off ONE shared
   * animation instead of a second animated value per blob. */
  readonly sign: 1 | -1;
}

interface RaysBlobProps {
  blob: RaysBlobSpec;
  progress: SharedValue<number>;
  aurora: number;
}

const RAYS_BLOB_BASE_OPACITY = 0.35;
const RAYS_BLOB_DRIFT_PX = 36;

/** One blurred "rays"-style circle, its centre derived from the shared
 * `progress` clock — no per-blob animation, just a per-blob phase (`sign`)
 * applied to the one shared value. */
function RaysBlob({ blob, progress, aurora }: RaysBlobProps): JSX.Element {
  const cx = useDerivedValue(() => {
    return blob.baseX + blob.sign * (progress.value - 0.5) * RAYS_BLOB_DRIFT_PX;
  });

  const cy = useDerivedValue(() => {
    return blob.baseY + blob.sign * (0.5 - progress.value) * RAYS_BLOB_DRIFT_PX;
  });

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={blob.radius}
      color={blob.color}
      opacity={RAYS_BLOB_BASE_OPACITY * aurora}
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
  return [
    {
      id: "rays-1",
      baseX: width * 0.22,
      baseY: height * 0.18,
      radius: spread * 0.32,
      color: t.accentPrimary,
      sign: 1,
    },
    {
      id: "rays-2",
      baseX: width * 0.82,
      baseY: height * 0.28,
      radius: spread * 0.28,
      color: t.accent2,
      sign: -1,
    },
    {
      id: "rays-3",
      baseX: width * 0.5,
      baseY: height * 0.88,
      radius: spread * 0.3,
      color: t.glowC ?? t.accentPrimary,
      sign: 1,
    },
  ];
}

interface AuroraCurtainBandSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Vertical gradient stops, top→bottom, alpha already fading toward 0 by
   * the last stop — this is what stands in for the web version's separate
   * CSS `mask-image` fade (see `AuroraCurtainBand`'s doc comment). */
  readonly colors: string[];
  readonly positions: number[];
  readonly blur: number;
  /** Base opacity (pre-`t.aurora` multiply), in the same 0.2–0.3 range as
   * the web layer opacities. */
  readonly opacity: number;
  /** Sway direction relative to the shared `progress` value, same idea as
   * `RaysBlobSpec.sign` — a per-band phase off the ONE shared animation. */
  readonly sign: 1 | -1;
}

interface AuroraCurtainBandProps {
  band: AuroraCurtainBandSpec;
  progress: SharedValue<number>;
  aurora: number;
}

const AURORA_SWAY_PX = 22;
const AURORA_SKEW = 0.05;

/**
 * One aurora curtain band: a blurred vertical `<LinearGradient>`-filled
 * `<Rect>`.
 *
 * FALLBACK APPROXIMATION, not a faithful port: the web aurora curtains
 * (`client-react`'s `AmbientBackground.module.css`) use a
 * `repeating-linear-gradient` "comb" texture (many alternating colour/
 * transparent stops at fixed pixel offsets) clipped by a separate
 * `mask-image` linear gradient for the top→bottom fade, plus an arched
 * (bottom-rounded) silhouette. Skia's shader/mask primitives have no direct
 * analogue for a *repeating* gradient comb, and reproducing the CSS mask
 * exactly means an extra `<Mask>`/nested-`<Group>` layer per band. Rather
 * than risk an unverifiable faithful attempt (no simulator access in this
 * task), each band here is ONE smooth `<LinearGradient>` whose colour stops
 * already carry the fixed aurora palette (green/teal/sky or purple/magenta)
 * AND fade to fully transparent by the final stop — baking the "comb" down
 * to a soft multi-colour wash and the "mask" down directly into the
 * gradient's own alpha ramp. Layered with the other two bands (offset
 * position + opposite sway phase) this still reads as a distinct aurora
 * curtain; it just lacks the web version's fine internal banding. See
 * `AmbientBackground`'s top doc comment and the task-12 report for the
 * explicit call-out of this deviation.
 */
function AuroraCurtainBand({
  band,
  progress,
  aurora,
}: AuroraCurtainBandProps): JSX.Element {
  const transform = useDerivedValue(() => {
    const drift = band.sign * (progress.value - 0.5);
    return [
      { translateX: drift * AURORA_SWAY_PX },
      { skewX: drift * AURORA_SKEW },
    ];
  });

  return (
    <Rect
      x={band.x}
      y={band.y}
      width={band.width}
      height={band.height}
      opacity={band.opacity * aurora}
      transform={transform}
      origin={vec(band.x + band.width / 2, band.y)}
    >
      <LinearGradient
        start={vec(band.x, band.y)}
        end={vec(band.x, band.y + band.height)}
        colors={band.colors}
        positions={band.positions}
      />
      <Blur blur={band.blur} />
    </Rect>
  );
}

/**
 * Three curtain bands, each spanning wider than the viewport (so sway never
 * reveals a hard edge) and stacked toward the top of the canvas like the web
 * version's curtains. Fixed aurora palette (not theme-tinted, matching
 * `client-react`'s `AmbientBackground.module.css`): band 1 is green→teal→sky
 * (`#3dffab` / `#2dd4bf` / `#38bdf8`), band 2 is purple→magenta
 * (`#a855f7` / `#d946ef`), band 3 is a white→green highlight comb
 * stand-in — the same three colour families the web curtains cycle through.
 */
function auroraCurtainSpecs(
  width: number,
  height: number,
): AuroraCurtainBandSpec[] {
  return [
    {
      id: "aurora-curtain-1",
      x: -width * 0.15,
      y: -height * 0.05,
      width: width * 1.3,
      height: height * 0.5,
      colors: [
        "rgba(61,255,171,0.55)",
        "rgba(45,212,191,0.32)",
        "rgba(56,189,248,0.14)",
        "rgba(56,189,248,0)",
      ],
      positions: [0, 0.35, 0.7, 1],
      blur: 14,
      opacity: 0.3,
      sign: 1,
    },
    {
      id: "aurora-curtain-2",
      x: -width * 0.1,
      y: -height * 0.02,
      width: width * 1.2,
      height: height * 0.42,
      colors: [
        "rgba(168,85,247,0.5)",
        "rgba(217,70,239,0.28)",
        "rgba(217,70,239,0.1)",
        "rgba(217,70,239,0)",
      ],
      positions: [0, 0.4, 0.72, 1],
      blur: 18,
      opacity: 0.24,
      sign: -1,
    },
    {
      id: "aurora-curtain-3",
      x: width * 0.08,
      y: height * 0.02,
      width: width * 0.9,
      height: height * 0.3,
      colors: [
        "rgba(255,255,255,0.28)",
        "rgba(61,255,171,0.34)",
        "rgba(61,255,171,0.1)",
        "rgba(61,255,171,0)",
      ],
      positions: [0, 0.3, 0.65, 1],
      blur: 10,
      opacity: 0.22,
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
