import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SurfaceCard } from "#/ui/SurfaceCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("renders a gradient sheen for variant=tile on a 3d skin", async () => {
  await renderWithTheme(
    <SurfaceCard variant="tile" testID="c">
      <Text>x</Text>
    </SurfaceCard>,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.getByTestId("surface-sheen")).toBeTruthy();
  expect(screen.getByTestId("c")).toBeTruthy();
});

test("renders no sheen for variant=panel even on a 3d skin", async () => {
  await renderWithTheme(
    <SurfaceCard variant="panel" testID="c">
      <Text>x</Text>
    </SurfaceCard>,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

test("renders no sheen on a flat skin even for variant=tile", async () => {
  // renderWithTheme defaults to holo.dark (a flat skin, depth.level 0), but
  // pass it explicitly since this test's whole point is the flat case.
  await renderWithTheme(
    <SurfaceCard variant="tile" testID="c">
      <Text>x</Text>
    </SurfaceCard>,
    rnThemeTokens.holo.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});
