import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const mockUsePrice = jest.fn();
const mockMotion = jest.fn<() => boolean>(() => {
  return true;
});

const { SpotTile } = require("./SpotTile") as typeof import("./SpotTile");

const pair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.08,
  typicalSpreadPips: 1,
};

test("renders the ask pips and opens the ticket on tap", async () => {
  mockUsePrice.mockReturnValue({
    symbol: "EURUSD",
    bid: 1.08716,
    ask: 1.0873,
    mid: 1.08723,
    spread: "1.4",
    movementType: PriceMovementType.UP,
    valueDate: "",
    creationTimestamp: 0,
  });
  const onOpen = jest.fn();
  await renderWithTheme(<SpotTile pair={pair} onOpenTicket={onOpen} />);

  expect(screen.getByText("EUR/USD")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-pips-EURUSD")).toBeTruthy(); // ask big digits

  await fireEvent.press(screen.getByTestId("spot-tile-EURUSD"));
  expect(onOpen).toHaveBeenCalledWith(pair);
});

test("shows a loading state before the first price", async () => {
  mockUsePrice.mockReturnValue(null);
  await renderWithTheme(<SpotTile pair={pair} onOpenTicket={jest.fn()} />);
  expect(screen.getByText(/Loading/i)).toBeTruthy();
});

// dc.html:108 — the design's price tile is a full `--tile-bg` /
// `--tile-shadow` surface, so 3d skins paint the vertical tile gradient.
test("renders the gradient tile surface on 3d skins", async () => {
  mockUsePrice.mockReturnValue(null);
  await renderWithTheme(
    <SpotTile pair={pair} onOpenTicket={jest.fn()} />,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.getByTestId("surface-sheen")).toBeTruthy();
});

test("flat skins render no gradient tile surface", async () => {
  // renderWithTheme defaults to holo.dark (flat, `tileGradient: null`).
  mockUsePrice.mockReturnValue(null);
  await renderWithTheme(<SpotTile pair={pair} onOpenTicket={jest.fn()} />);
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return { usePrice: mockUsePrice };
    },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotion();
    },
  };
});
