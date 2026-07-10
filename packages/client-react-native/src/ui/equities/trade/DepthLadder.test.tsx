import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { DepthBook } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { DepthLadder } from "#/ui/equities/trade/DepthLadder";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const BOOK: DepthBook = {
  symbol: "AAPL",
  bids: [
    { price: 182.3, size: 500 },
    { price: 182.2, size: 300 },
  ],
  asks: [
    { price: 182.5, size: 400 },
    { price: 182.6, size: 200 },
  ],
};

test("renders bid/ask rows and the spread", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(BOOK)}>
      <DepthLadder symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("depth-ladder")).toBeTruthy();
  expect(screen.getByTestId("depth-row-ask-182.5")).toBeTruthy();
  expect(screen.getByTestId("depth-row-bid-182.3")).toBeTruthy();
  expect(screen.getByTestId("depth-spread")).toHaveTextContent("0.20", {
    exact: false,
  });
});

test("shows an empty state when there is no depth book", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(null)}>
      <DepthLadder symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("depth-empty")).toBeTruthy();
});

test("renders no gradient tile surface even on a 3d skin (dense panel, not a hero tile)", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(BOOK)}>
      <DepthLadder symbol="AAPL" />
    </ViewModelProvider>,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

function vmWith(book: DepthBook | null): ViewModel {
  return {
    useDepth: () => {
      return book;
    },
  } as unknown as ViewModel;
}
