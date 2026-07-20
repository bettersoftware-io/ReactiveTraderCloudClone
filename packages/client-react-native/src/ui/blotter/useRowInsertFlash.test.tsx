import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import Animated from "react-native-reanimated";

import { useRowInsertFlash } from "./useRowInsertFlash";

// Probe lives nested inside the test (not at module scope) so the file has no
// unexported top-level component — mirrors useTickFlash.test.tsx and
// satisfies Biome's useComponentExportOnlyModules.
//
// RNTL 14 (React 19) made `render`/`rerender` async — they await a concurrent
// `act` (see harnessProbe.test.tsx). Reanimated is globally jest-mocked, so
// this can only assert mount/transition survival and that a style is
// returned — it cannot assert timing.
test("mounts and survives isNew and gating transitions", async () => {
  function Probe({ isNew, enabled }: ProbeProps): React.JSX.Element {
    const { flashStyle } = useRowInsertFlash(
      isNew,
      "#22c55e",
      "#00060a",
      enabled,
    );
    return (
      <Animated.View style={flashStyle}>
        <Text>row</Text>
      </Animated.View>
    );
  }

  const { rerender } = await render(<Probe isNew={false} enabled />);
  expect(screen.getByText("row")).toBeTruthy();
  await rerender(<Probe isNew enabled />);
  await rerender(<Probe isNew enabled={false} />);
  expect(screen.getByText("row")).toBeTruthy();
});

interface ProbeProps {
  isNew: boolean;
  enabled: boolean;
}
