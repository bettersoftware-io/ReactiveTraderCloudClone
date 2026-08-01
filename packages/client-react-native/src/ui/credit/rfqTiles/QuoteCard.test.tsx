import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Dealer, Quote } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { QuoteCard } from "#/ui/credit/rfqTiles/QuoteCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const DEALER: Dealer = { id: 7, name: "Bank A" };

test("shows dealer name and price for a priced quote", async () => {
  await renderQuote({ state: { type: "pendingWithPrice", price: 99 } });
  expect(screen.getByTestId("quote-card-42")).toBeTruthy();
  expect(screen.getByText("Bank A")).toBeTruthy();
  expect(screen.getByText("$99")).toBeTruthy();
});

test("Accept fires onAccept with the quote id for a priced pending quote", async () => {
  const onAccept = jest.fn<(id: number) => void>();
  await renderQuote({
    state: { type: "pendingWithPrice", price: 99 },
    acceptSlot: onAccept,
  });
  void fireEvent.press(screen.getByTestId("quote-accept-42"));
  expect(onAccept).toHaveBeenCalledWith(42);
});

test("no Accept button without a price; the dealer reads AWAITING instead", async () => {
  await renderQuote({ state: { type: "pendingWithoutPrice" } });
  expect(screen.queryByTestId("quote-accept-42")).toBeNull();
  expect(screen.getByText("AWAITING")).toBeTruthy();
});

test("no Accept button without an onAccept slot", async () => {
  await renderQuote({
    state: { type: "pendingWithPrice", price: 99 },
    acceptSlot: null,
  });
  expect(screen.queryByTestId("quote-accept-42")).toBeNull();
});

test("the best quote haloes its ACCEPT button", async () => {
  await renderQuote({
    state: { type: "pendingWithPrice", price: 99 },
    isBest: true,
  });
  expect(screen.getByTestId("accept-pulse")).toBeTruthy();
});

test("a non-best quote gets no halo", async () => {
  await renderQuote({ state: { type: "pendingWithPrice", price: 99 } });
  expect(screen.queryByTestId("accept-pulse")).toBeNull();
});

test("renders no gradient tile surface even on a 3d skin (dense row, not a hero tile)", async () => {
  await renderQuote(
    { state: { type: "pendingWithPrice", price: 99 } },
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

interface RenderOptions {
  readonly state: Quote["state"];
  readonly isBest?: boolean;
  /** `null` means "the card is given no accept slot at all" — distinct from
   * omitting the key, which supplies a no-op one. A defaulted parameter cannot
   * express that: passing `undefined` explicitly still triggers the default. */
  readonly acceptSlot?: ((id: number) => void) | null;
}

const VIEW_MODEL = {
  usePowerSaver: () => {
    return { isFreeze: false };
  },
} as unknown as ViewModel;

function noopAccept(): void {}

function renderQuote(
  { state, isBest = false, acceptSlot = noopAccept }: RenderOptions,
  theme?: RnTheme,
): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={VIEW_MODEL}>
      <QuoteCard
        quote={{ id: 42, rfqId: 1, dealerId: 7, state }}
        dealer={DEALER}
        isBest={isBest}
        onAccept={acceptSlot ?? undefined}
      />
    </ViewModelProvider>,
    theme,
  );
}
