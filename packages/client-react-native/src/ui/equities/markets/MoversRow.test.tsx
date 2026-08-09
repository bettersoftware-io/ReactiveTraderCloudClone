import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

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
    <ViewModelProvider viewModel={vm()}>
      <MoversRow
        row={ROW}
        rank={1}
        selected={false}
        onSelect={(): void => {}}
      />
    </ViewModelProvider>,
  );
  expect(screen.getByText("01")).toBeTruthy();
  expect(screen.getByText("TSLA")).toBeTruthy();
  expect(screen.getByText("Tesla Inc")).toBeTruthy();
  expect(screen.getByText("248.67")).toBeTruthy();
  expect(screen.getByText("+1.13%")).toBeTruthy();
});

test("a negative change keeps its own sign", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <MoversRow
        row={{ ...ROW, changePct: -1.06 }}
        rank={8}
        selected={false}
        onSelect={(): void => {}}
      />
    </ViewModelProvider>,
  );
  expect(screen.getByText("08")).toBeTruthy();
  expect(screen.getByText("-1.06%")).toBeTruthy();
});

test("renders placeholders rather than NaN before the first quote", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <MoversRow
        row={{ symbol: "ZZZZ", name: "Pending", last: null, changePct: null }}
        rank={9}
        selected={false}
        onSelect={(): void => {}}
      />
    </ViewModelProvider>,
  );
  expect(screen.queryByText("NaN")).toBeNull();
  expect(screen.getByText("—")).toBeTruthy();
});

test("pressing the row selects its symbol", async () => {
  const onSelect = jest.fn();

  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <MoversRow row={ROW} rank={1} selected={false} onSelect={onSelect} />
    </ViewModelProvider>,
  );
  fireEvent.press(screen.getByTestId("eq-mover-TSLA"));
  expect(onSelect).toHaveBeenCalledWith("TSLA");
});

// `MoversRow` now wires in `RowSparkline`, which reads `useCandles` off the
// ViewModel — so every render needs a provider. An empty series is enough:
// these tests assert the row's own text/press behaviour, not the sparkline
// (that's `RowSparkline.test.tsx`'s job).
function vm(): ViewModel {
  return {
    useCandles: () => {
      return [];
    },
  } as unknown as ViewModel;
}
