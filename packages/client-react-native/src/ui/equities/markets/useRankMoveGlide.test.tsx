import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { useRankMoveGlide } from "./useRankMoveGlide";

const RISE_COLOR = "#2bffb3";
const FALL_COLOR = "#ff5d73";

// Probe lives nested inside the test (not at module scope) so the file has no
// unexported top-level component — mirrors useTickFlash.test.tsx and
// satisfies Biome's useComponentExportOnlyModules.
//
// RNTL 14 (React 19) made `render`/`rerender` async — they await a concurrent
// `act` (see harnessProbe.test.tsx).
test("tints the overlay by direction — rise green, fall red, never the other way", async () => {
  function Probe({ rank, enabled }: ProbeProps): React.JSX.Element {
    const { overlayStyle } = useRankMoveGlide(
      rank,
      RISE_COLOR,
      FALL_COLOR,
      enabled,
    );
    return <Animated.View testID="overlay" style={overlayStyle} />;
  }

  const { rerender } = await render(<Probe rank={2} enabled />);
  // First render: no PREVIOUS rank recorded yet, so no pulse plays — the
  // shared value starts at its seed colour rather than either real one.
  expect(overlayBackground()).toBe(RISE_COLOR);

  // Reanimated's jest mock evaluates `useAnimatedStyle` SYNCHRONOUSLY as
  // part of render (`IMMEDIATE_CALLBACK_INVOCATION` in its source), but this
  // hook's shared-value writes happen inside a `useEffect` — the same place
  // every sibling hook in this file (`useTickFlash`, `useRowInsertFlash`)
  // writes theirs, and the only place a real device's Reanimated writes
  // belong. An effect commits AFTER the render that triggered it already
  // returned its style, so the write from rerendering to a new `rank` is
  // invisible in THAT render's own committed style — a second identical-
  // props render is needed to read it back, standing in for the next frame
  // a real device would re-evaluate on. `advance` does both rerenders.

  // rank improves 2 → 1 (a numerically LOWER rank, up the board): "rose".
  await advance(rerender, 1, true);
  expect(overlayBackground()).toBe(RISE_COLOR);

  // rank worsens 1 → 3 (a numerically HIGHER rank, down the board): "fell".
  // This is the assertion that catches the bug where every direction change
  // was misclassified "rose" (computeRankDirections's array-index semantics
  // don't apply to a single row) — it is red against that code and green
  // against directionFor's direct numeric comparison.
  await advance(rerender, 3, true);
  expect(overlayBackground()).toBe(FALL_COLOR);

  // rank improves again 3 → 1: back to "rose".
  await advance(rerender, 1, true);
  expect(overlayBackground()).toBe(RISE_COLOR);

  // motion gated off: any in-flight pulse is cancelled, opacity held at 0,
  // no crash — the tint itself is irrelevant once invisible.
  await advance(rerender, 2, false);
  expect(overlayOpacity()).toBe(0);

  async function advance(
    rerenderFn: (element: React.ReactElement) => Promise<void>,
    rank: number,
    enabled: boolean,
  ): Promise<void> {
    // Two SEPARATE element literals, not one reused reference: React bails
    // out of re-invoking a function component when the new props object is
    // REFERENTIALLY identical to the previous one, which would silently
    // skip the second render this helper depends on.
    await rerenderFn(<Probe rank={rank} enabled={enabled} />);
    await rerenderFn(<Probe rank={rank} enabled={enabled} />);
  }
});

interface ProbeProps {
  rank: number;
  enabled: boolean;
}

function overlayStyle(): ViewStyle {
  return screen.getByTestId("overlay").props.style as ViewStyle;
}

function overlayBackground(): unknown {
  return overlayStyle().backgroundColor;
}

function overlayOpacity(): unknown {
  return overlayStyle().opacity;
}
