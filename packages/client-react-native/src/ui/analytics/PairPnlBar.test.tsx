import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockMotion = jest.fn<() => boolean>(() => {
  return true;
});

const { PairPnlBar } = require("./PairPnlBar") as typeof import("./PairPnlBar");

test("renders a positive bar anchored to the right of the centre line", async () => {
  await renderWithTheme(<PairPnlBar fraction={0.6} positive={true} />);
  expect(screen.getByTestId("pair-pnl-bar-pos")).toBeTruthy();
});

test("renders a negative bar anchored to the left of the centre line", async () => {
  await renderWithTheme(<PairPnlBar fraction={0.6} positive={false} />);
  expect(screen.getByTestId("pair-pnl-bar-neg")).toBeTruthy();
});

// With motion off the bar must render its RESTING size immediately — not a
// mid-tween frame, and not a collapsed bar that never grows because the tween
// it was waiting on never runs.
test("renders at rest immediately when motion is disabled", async () => {
  mockMotion.mockReturnValue(false);
  await renderWithTheme(<PairPnlBar fraction={0.75} positive={true} />);

  expect(screen.getByTestId("pair-pnl-bar-pos")).toBeTruthy();
  mockMotion.mockReturnValue(true);
});

test("survives a zero fraction, where the bar scales to nothing", async () => {
  await renderWithTheme(<PairPnlBar fraction={0} positive={true} />);
  expect(screen.getByTestId("pair-pnl-bar-pos")).toBeTruthy();
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotion();
    },
  };
});
