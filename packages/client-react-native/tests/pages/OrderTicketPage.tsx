// packages/client-react-native/tests/pages/OrderTicketPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrderTicket } from "#/ui/equities/trade/OrderTicket";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";
import { normalizeText, textContentOf } from "#tests/pages/support/textContent";

interface OrderTicketIntents {
  setSide?: () => void;
  setType?: () => void;
  setQty?: (qty: number) => void;
  setLimitPrice?: (price: number) => void;
  submit?: () => void;
  reset?: () => void;
}

function vmWith(
  state: OrderTicketState,
  intents: OrderTicketIntents,
): ViewModel {
  return {
    useEquityQuote: () => {
      return {
        symbol: "AAPL",
        bid: 0,
        ask: 0,
        last: 189.5,
        changePct: 0.42,
        timestamp: 0,
      };
    },
    useOrderTicket: () => {
      return {
        state,
        setSide: intents.setSide ?? (() => {}),
        setType: intents.setType ?? (() => {}),
        setQty: intents.setQty ?? (() => {}),
        setLimitPrice: intents.setLimitPrice ?? (() => {}),
        submit: intents.submit ?? (() => {}),
        reset: intents.reset ?? (() => {}),
      };
    },
  } as unknown as ViewModel;
}

export interface OrderTicketPage {
  mount(
    state: OrderTicketState,
    intents?: OrderTicketIntents,
    theme?: RnTheme,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
  containsTextContent(testId: string, substring: string): boolean;
  press(testId: string): Promise<void>;
  selected(testId: string): boolean;
}

/** The framework surface for `OrderTicket.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function orderTicketPage(): OrderTicketPage {
  return {
    async mount(
      state: OrderTicketState,
      intents: OrderTicketIntents = {},
      theme?: RnTheme,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vmWith(state, intents)}>
          <OrderTicket symbol="AAPL" />
        </ViewModelProvider>,
        theme,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasTextContent(testId: string, text: string): boolean {
      return (
        normalizeText(textContentOf(screen.getByTestId(testId))) ===
        normalizeText(text)
      );
    },
    // Mirrors RNTL's `toHaveTextContent(text, { exact: false })`: a
    // case-insensitive substring match on the normalized text, not an exact
    // one.
    containsTextContent(testId: string, substring: string): boolean {
      return normalizeText(textContentOf(screen.getByTestId(testId)))
        .toLowerCase()
        .includes(normalizeText(substring).toLowerCase());
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    selected(testId: string): boolean {
      const state = screen.getByTestId(testId).props.accessibilityState as
        | { selected?: boolean }
        | undefined;
      return state?.selected === true;
    },
  };
}
