import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { InstrumentTabs } from "#/ui/equities/trade/InstrumentTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
];

test("renders a tab per instrument and reports selection", async () => {
  const onSelect = jest.fn();
  const vm = {
    useWatchlist: () => {
      return INSTS;
    },
  } as unknown as ViewModel;
  await renderWithTheme(
    <ViewModelProvider viewModel={vm}>
      <InstrumentTabs selectedSymbol="AAPL" onSelect={onSelect} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("instrument-tab-AAPL")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("instrument-tab-MSFT"));
  expect(onSelect).toHaveBeenCalledWith("MSFT");
});
