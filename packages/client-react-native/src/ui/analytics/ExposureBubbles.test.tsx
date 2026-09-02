import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// EURUSD contributes to EUR (base) and USD (counter); USDJPY to USD and JPY.
const POSITIONS: readonly CurrencyPairPosition[] = [
  {
    symbol: "EURUSD",
    basePnl: 0,
    baseTradedAmount: 1_000_000,
    counterTradedAmount: -1_100_000,
  },
  {
    symbol: "USDJPY",
    basePnl: 0,
    baseTradedAmount: 500_000,
    counterTradedAmount: -55_000_000,
  },
];

/**
 * These tests prove the canvas MOUNTS and survives every book shape. They
 * deliberately assert nothing about individual bubbles: Skia elements take no
 * `testID`, so there is nothing to query. Which currencies appear, how big,
 * which accent and which labels they carry are decided in
 * `buildBubbleDrawModel` and asserted in its own test.
 */
test("mounts a canvas for a book with positions", async () => {
  await renderWithTheme(<ExposureBubbles positions={POSITIONS} />);
  expect(screen.getByTestId("exposure-bubbles")).toBeTruthy();
});

test("collapses to nothing when there are no positions", async () => {
  await renderWithTheme(<ExposureBubbles positions={[]} />);

  // Nothing to draw, so the card must not reserve a gap. `style` is the
  // array-form dynamic member (static width + computed height), so the
  // computed piece is asserted as one element rather than the whole prop.
  expect(screen.getByTestId("exposure-bubbles").props.style).toContainEqual(
    expect.objectContaining({ height: 0 }),
  );
});

test("reserves the height the tallest shelf needs", async () => {
  await renderWithTheme(<ExposureBubbles positions={POSITIONS} />);

  // JPY dominates this book, so it takes the design ramp's 74px cap and the
  // other two sit near its 30px floor — one shelf, as tall as JPY. `style` is
  // the array-form dynamic member; the computed height is one element.
  expect(screen.getByTestId("exposure-bubbles").props.style).toContainEqual(
    expect.objectContaining({ height: 74 }),
  );
});

test("survives a book whose currencies all carry the same magnitude", async () => {
  // Equal magnitudes collapse the domain radius scale's lower bound to zero —
  // the one branch in `aggregatePositionsByCurrency` that could otherwise
  // divide by zero. The draw model rescales on top of it, so this also covers
  // a book where every bubble lands on `scaleBubbleRadius`'s 74px cap.
  await renderWithTheme(
    <ExposureBubbles
      positions={[
        {
          symbol: "EURUSD",
          basePnl: 0,
          baseTradedAmount: 1_000_000,
          counterTradedAmount: -1_000_000,
        },
      ]}
    />,
  );
  expect(screen.getByTestId("exposure-bubbles")).toBeTruthy();
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
