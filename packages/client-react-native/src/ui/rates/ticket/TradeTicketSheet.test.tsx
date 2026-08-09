// packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { CurrencyPair, Price } from "@rtc/domain";
import { Direction, PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

const mockExecute = jest.fn();
// `useTileExecution().state.status` mutable across renders — the auto-close
// test below drives it terminal -> ready across two `rerender()` calls to
// exercise TileExecutionMachine's real terminal-state contract (see
// TradeTicketSheet.tsx's own comment: "record that a terminal state was
// seen, then dismiss the sheet when the machine returns to ready").
let mockExecutionStatus: "ready" | "finished" | "timeout" = "ready";
const mockPrice: Price = {
  symbol: "EURUSD",
  bid: 1.08716,
  ask: 1.0873,
  mid: 1.08723,
  spread: "1.4",
  movementType: PriceMovementType.UP,
  valueDate: "",
  creationTimestamp: 0,
};

const { TradeTicketSheet } =
  require("./TradeTicketSheet") as typeof import("./TradeTicketSheet");

const pair: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.08,
  typicalSpreadPips: 1,
};

test("executes a buy at the current notional", async () => {
  mockExecutionStatus = "ready";
  await renderWithTheme(<TradeTicketSheet pair={pair} onClose={jest.fn()} />);
  expect(screen.getByText("EUR/USD")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("buy-pad"));
  expect(mockExecute).toHaveBeenCalledWith(Direction.Buy, mockPrice, 1_000_000);
});

// The double at `__mocks__/@gorhom/bottom-sheet.tsx` used to model
// `present`/`dismiss` without ever calling `onDismiss` — so this auto-close
// path (TileExecutionMachine's own terminal-state auto-dismiss timer,
// `TradeTicketSheet.tsx:62-68`: `dismiss()` -> the real component's
// `onDismiss` -> this component's `onClose`) had no assertion of its
// observable effect anywhere in the suite. Drives the mocked
// `useTileExecution().state.status` terminal -> ready across two
// `rerender()` calls (RNTL's `rerender` replaces the whole previous tree, so
// the theme wrapper is reapplied by hand each time, same as
// AppearanceOverlay.test.tsx's `wrapped()` helper) to prove `onClose` fires
// exactly once, only once the machine returns to `ready` — not on the
// terminal state itself.
test("auto-close: dismissing on terminal -> ready fires onDismiss, which calls onClose", async () => {
  const onClose = jest.fn();
  mockExecutionStatus = "ready";
  const { rerender } = await renderWithTheme(
    <TradeTicketSheet pair={pair} onClose={onClose} />,
  );

  mockExecutionStatus = "finished";
  await rerender(withTheme(<TradeTicketSheet pair={pair} onClose={onClose} />));
  expect(onClose).not.toHaveBeenCalled();

  mockExecutionStatus = "ready";
  await rerender(withTheme(<TradeTicketSheet pair={pair} onClose={onClose} />));
  expect(onClose).toHaveBeenCalledTimes(1);
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        usePrice: () => {
          return mockPrice;
        },
        useNotional: () => {
          return {
            state: {
              displayValue: "1,000,000",
              numericValue: 1_000_000,
              error: null,
            },
            change: jest.fn(),
            reset: jest.fn(),
          };
        },
        useTileExecution: () => {
          return {
            state: { status: mockExecutionStatus },
            execute: mockExecute,
            dismiss: jest.fn(),
          };
        },
      };
    },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return false;
    },
  };
});

/** `renderWithTheme`'s own wrapper, reapplied by hand for `rerender()` —
 * `rerender` swaps the whole previous tree, so it needs the same
 * `ThemeContext.Provider` `renderWithTheme` supplies on the first render. */
function withTheme(ui: ReactElement): ReactElement {
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      {ui}
    </ThemeContext.Provider>
  );
}
