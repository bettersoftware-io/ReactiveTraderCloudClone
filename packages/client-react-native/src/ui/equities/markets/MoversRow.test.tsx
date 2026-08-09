import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { MoversRow } from "#/ui/equities/markets/MoversRow";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const ROW = {
  symbol: "TSLA",
  name: "Tesla Inc",
  last: 248.67,
  changePct: 1.13,
};

test("renders a zero-padded rank, symbol, name, price and signed pct", async () => {
  await renderWithTheme(
    <MoversRow row={ROW} rank={1} selected={false} onSelect={(): void => {}} />,
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
    />,
  );
  expect(screen.queryByText("NaN")).toBeNull();
  expect(screen.getByText("—")).toBeTruthy();
});

test("pressing the row selects its symbol", async () => {
  const onSelect = jest.fn();

  await renderWithTheme(
    <MoversRow row={ROW} rank={1} selected={false} onSelect={onSelect} />,
  );
  fireEvent.press(screen.getByTestId("eq-mover-TSLA"));
  expect(onSelect).toHaveBeenCalledWith("TSLA");
});
