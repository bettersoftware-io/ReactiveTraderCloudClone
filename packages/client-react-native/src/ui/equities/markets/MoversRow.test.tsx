import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";

import { MoversRow } from "#/ui/equities/markets/MoversRow";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const ROW = {
  symbol: "TSLA",
  name: "Tesla Inc",
  last: 248.67,
  changePct: 1.13,
};

// RowSparkline now takes `candles` as a plain prop (Task 3 lifted the
// `useCandles` read up to MoversBoard's MoversBoardRow, so this leaf and
// RowSparkline stay compiler-memoizable) — an empty series is enough: these
// tests assert the row's own text/press behaviour, not the sparkline (that's
// RowSparkline.test.tsx's job).
const NO_CANDLES: readonly Candle[] = [];

test("renders a zero-padded rank, symbol, name, price and signed pct", async () => {
  await renderWithTheme(
    <MoversRow
      row={ROW}
      rank={1}
      selected={false}
      onSelect={(): void => {}}
      candles={NO_CANDLES}
    />,
  );
  expect(screen.getByText("01")).toBeTruthy();
  expect(screen.getByText("TSLA")).toBeTruthy();
  expect(screen.getByText("Tesla Inc")).toBeTruthy();
  expect(screen.getByText("248.67")).toBeTruthy();
  expect(screen.getByText("+1.13%")).toBeTruthy();
});

test("a negative change keeps its own sign", async () => {
  await renderWithTheme(
    <MoversRow
      row={{ ...ROW, changePct: -1.06 }}
      rank={8}
      selected={false}
      onSelect={(): void => {}}
      candles={NO_CANDLES}
    />,
  );
  expect(screen.getByText("08")).toBeTruthy();
  expect(screen.getByText("-1.06%")).toBeTruthy();
});

test("renders placeholders rather than NaN before the first quote", async () => {
  await renderWithTheme(
    <MoversRow
      row={{ symbol: "ZZZZ", name: "Pending", last: null, changePct: null }}
      rank={9}
      selected={false}
      onSelect={(): void => {}}
      candles={NO_CANDLES}
    />,
  );
  expect(screen.queryByText("NaN")).toBeNull();
  expect(screen.getByText("—")).toBeTruthy();
});

test("pressing the row selects its symbol", async () => {
  const onSelect = jest.fn();

  await renderWithTheme(
    <MoversRow
      row={ROW}
      rank={1}
      selected={false}
      onSelect={onSelect}
      candles={NO_CANDLES}
    />,
  );
  await fireEvent.press(screen.getByTestId("eq-mover-TSLA"));
  expect(onSelect).toHaveBeenCalledWith("TSLA");
});
