import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("defaults to Orders and switches to Positions", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <BlottersView />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("orders-empty")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("blotter-toggle-positions"));
  expect(screen.getByTestId("desk-pnl-gauge")).toBeTruthy();
  expect(screen.getByTestId("positions-empty")).toBeTruthy();
});

function vm(): ViewModel {
  return {
    useEquityOrders: () => {
      return [];
    },
    useEquityPositions: () => {
      return [];
    },
  } as unknown as ViewModel;
}

// `vm()` only stubs `useEquityOrders`/`useEquityPositions`; the orders tab's
// row-insert-flash reads `usePowerSaver` off the same ViewModel context via
// `useShellMotionEnabled`, so it's mocked directly here — mirrors
// OrdersBlotter.test.tsx.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
