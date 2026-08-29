import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("stacks ORDERS and POSITIONS on one view, each under its label", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <BlottersView />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("blotters-view")).toBeTruthy();
  expect(screen.getByText("ORDERS")).toBeTruthy();
  expect(screen.getByText("POSITIONS")).toBeTruthy();
  expect(screen.getByTestId("orders-empty")).toBeTruthy();
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

// `vm()` only stubs `useEquityOrders`/`useEquityPositions`; the orders list's
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
