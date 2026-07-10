import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Dealer, Quote } from "@rtc/domain";

import { QuoteCard } from "#/ui/credit/rfqTiles/QuoteCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const DEALER: Dealer = { id: 7, name: "Bank A" };

test("shows dealer name and price for a priced quote", async () => {
  await renderWithTheme(
    <QuoteCard
      quote={quote({ type: "pendingWithPrice", price: 99 })}
      dealer={DEALER}
      onAccept={(): void => {}}
    />,
  );
  expect(screen.getByTestId("quote-card-42")).toBeTruthy();
  expect(screen.getByText("Bank A")).toBeTruthy();
  expect(screen.getByText("$99")).toBeTruthy();
});

test("Accept fires onAccept with the quote id for a priced pending quote", async () => {
  const onAccept = jest.fn<(id: number) => void>();
  await renderWithTheme(
    <QuoteCard
      quote={quote({ type: "pendingWithPrice", price: 99 })}
      dealer={DEALER}
      onAccept={onAccept}
    />,
  );
  void fireEvent.press(screen.getByTestId("quote-accept-42"));
  expect(onAccept).toHaveBeenCalledWith(42);
});

test("no Accept button without a price or without onAccept", async () => {
  await renderWithTheme(
    <QuoteCard
      quote={quote({ type: "pendingWithoutPrice" })}
      dealer={DEALER}
      onAccept={(): void => {}}
    />,
  );
  expect(screen.queryByTestId("quote-accept-42")).toBeNull();
  expect(screen.getByText("Awaiting response")).toBeTruthy();
});

test("renders no gradient tile surface even on a 3d skin (dense panel, not a hero tile)", async () => {
  await renderWithTheme(
    <QuoteCard
      quote={quote({ type: "pendingWithPrice", price: 99 })}
      dealer={DEALER}
      onAccept={(): void => {}}
    />,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

function quote(state: Quote["state"]): Quote {
  return { id: 42, rfqId: 1, dealerId: 7, state };
}
