// packages/client-react-native/src/ui/ambient/AmbientBackground.tsx
import { Canvas, Group, Line, vec } from "@shopify/react-native-skia";
import type { JSX, ReactNode } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { AmbientRays } from "#/ui/ambient/AmbientRays";
import { AuroraCurtains } from "#/ui/ambient/AuroraCurtains";
import { useAmbientEnabled } from "#/ui/ambient/useAmbientEnabled";
import { useAuroraClocks } from "#/ui/ambient/useAuroraClocks";
import { useRaysClocks } from "#/ui/ambient/useRaysClocks";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * Ambient background: a full-bleed Skia canvas mounted BEHIND the app's
 * routed content — a faint HUD grid (`t.gridC`, shared) plus ONE of two
 * mutually-exclusive animated layer groups, selected by the `ambientStyle`
 * preference (`useAmbientStyle()`). Both are the web client's, layer for
 * layer:
 *   - `"rays"` (`testID="ambient-rays"`) — two accent-coloured glows and a
 *     slowly turning beam: see `AmbientRays`.
 *   - `"aurora"` (`testID="ambient-aurora-curtains"`, the default) —
 *     northern-lights curtains on a fixed palette: see `AuroraCurtains`.
 *
 * History, because both styles looked different until 2026-10-06: the aurora
 * drew the mobile design's two accent washes (dc.html:57-58) and the rays
 * drew three blurred blobs with no beam. The owner's reference for both is
 * the web client, so both were replaced by ports of it.
 *
 * The skin's `aurora` intensity scales only the aurora's two glow layers, as
 * on the web — never its curtains, which is what once made that style read
 * as absent. The rays are drawn at one strength in every skin (see
 * `AmbientRays` for why that departs from the web).
 *
 * The canvas is gated by `useAmbientEnabled()` (the animated-background
 * preference ANDed with OS reduced-motion); the component returns `null`
 * when off, so no worklet or canvas mounts at all — calm-until-real-event
 * per the perf doctrine.
 *
 * The DRIFT is additionally gated by `useShellMotionEnabled()`, which each
 * style's clock hook asks for itself: under
 * power-saver Freeze the canvas still paints (grid + the style's resting
 * frame) but no loop starts — Freeze is the tier that kills every motion. It
 * is also what lets the visual harness capture the ambient layer at all: with
 * the preference on and Freeze seeded, the frame is the same on every
 * capture.
 *
 * Each style owns its loops (five for the aurora, three for the rays), one
 * Reanimated shared value per CSS animation it ports, and only the mounted
 * style's run. Skia reads them on the UI thread through `useDerivedValue` —
 * position, scale, skew and rotation only, opacity is never animated — so
 * React never re-renders per frame (transform-equivalent only, per
 * docs/performance.md's RN-adapted rule).
 */
export function AmbientBackground(): JSX.Element | null {
  const enabled = useAmbientEnabled();
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const { useAmbientStyle } = useViewModel();
  const { style } = useAmbientStyle();
  // Made here and handed down: a hook that reads the view model cannot run
  // inside the canvas (see `useAuroraClocks`). Only the showing style's run.
  const auroraClocks = useAuroraClocks(enabled && style === "aurora");
  const raysClocks = useRaysClocks(enabled && style === "rays");

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
        <TestGroup testID="ambient-rays">
          <AmbientRays
            width={width}
            height={height}
            theme={t}
            clocks={raysClocks}
          />
        </TestGroup>
      ) : (
        <TestGroup testID="ambient-aurora-curtains">
          <AuroraCurtains
            width={width}
            height={height}
            glowStrength={t.aurora}
            clocks={auroraClocks}
          />
        </TestGroup>
      )}
    </Canvas>
  );
}

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
