import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import Animated from "react-native-reanimated";

import { useRankMoveGlide } from "./useRankMoveGlide";

// Probe lives nested inside the test (not at module scope) so the file has no
// unexported top-level component — mirrors useTickFlash.test.tsx and
// satisfies Biome's useComponentExportOnlyModules.
//
// RNTL 14 (React 19) made `render`/`rerender` async — they await a concurrent
// `act` (see harnessProbe.test.tsx).
test("mounts and survives rank changes and motion gating", async () => {
  function Probe({ rank, enabled }: ProbeProps): React.JSX.Element {
    const { overlayStyle } = useRankMoveGlide(
      rank,
      "#2bffb3",
      "#ff5d73",
      enabled,
    );
    return (
      <Animated.View style={overlayStyle}>
        <Text>glow</Text>
      </Animated.View>
    );
  }

  const { rerender } = await render(<Probe rank={2} enabled />);
  expect(screen.getByText("glow")).toBeTruthy();
  // rank improves (2 → 1): a "rose" pulse plays.
  await rerender(<Probe rank={1} enabled />);
  // rank worsens (1 → 3): a "fell" pulse plays.
  await rerender(<Probe rank={3} enabled />);
  // motion gated off: any in-flight pulse is cancelled, no crash.
  await rerender(<Probe rank={1} enabled={false} />);
  expect(screen.getByText("glow")).toBeTruthy();
});

interface ProbeProps {
  rank: number;
  enabled: boolean;
}
