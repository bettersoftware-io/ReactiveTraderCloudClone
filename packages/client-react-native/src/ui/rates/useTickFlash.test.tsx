import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import Animated from "react-native-reanimated";

import { useTickFlash } from "./useTickFlash";

// Probe lives nested inside the test (not at module scope) so the file has no
// unexported top-level component — mirrors useShellMotionEnabled.test.tsx and
// satisfies Biome's useComponentExportOnlyModules.
//
// RNTL 14 (React 19) made `render`/`rerender` async — they await a concurrent
// `act` (see harnessProbe.test.tsx).
test("mounts and survives value changes and gating", async () => {
  function Probe({ value, enabled }: ProbeProps): React.JSX.Element {
    const { flashStyle } = useTickFlash(value, enabled);
    return (
      <Animated.View style={flashStyle}>
        <Text>flash</Text>
      </Animated.View>
    );
  }

  const { rerender } = await render(<Probe value={1.085} enabled />);
  expect(screen.getByText("flash")).toBeTruthy();
  await rerender(<Probe value={1.086} enabled />);
  await rerender(<Probe value={1.086} enabled={false} />);
  expect(screen.getByText("flash")).toBeTruthy();
});

interface ProbeProps {
  value: number;
  enabled: boolean;
}
