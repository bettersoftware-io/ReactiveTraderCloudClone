import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CreditScreen } from "#/credit/CreditScreen";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CreditScreen", () => {
  test("renders the three Credit panels", () => {
    const { getByText } = renderCreditScreen();
    expect(getByText("✚ New RFQ")).toBeTruthy();
    expect(getByText("◳ RFQs")).toBeTruthy();
    expect(getByText("▤ Credit Blotter")).toBeTruthy();
  });

  test("sending an RFQ adds a live card", () => {
    // Freezes the screen's clock interval and the quote/flash timeouts that
    // sending schedules, so the card is asserted in its just-sent state.
    vi.useFakeTimers();
    const { getByTestId, container } = renderCreditScreen();
    // Both the seeded closed RFQ card (RfqCard's plain ticker/bank spans)
    // and the New RFQ form share text with the seed data ("MSFT 3.3 02/27",
    // "Citi") once mounted together in the full screen — scoping to the form
    // lands every click on its interactive picker/checklist rows, which the
    // seeded card's read-only spans aren't. Scoped getByText, not a
    // screen-wide getByRole({ name }): computing an accessible name for every
    // button on the screen made this test cost ~5x more, enough to cross the
    // 5 s timeout on an oversubscribed CI runner.
    const form = within(getByTestId("new-rfq-form"));
    fireEvent.click(form.getByText("Select instrument"));
    fireEvent.click(form.getByText("MSFT 3.3 02/27"));
    fireEvent.change(form.getByPlaceholderText("0"), {
      target: { value: "500" },
    });
    fireEvent.click(form.getByText("Citi"));
    fireEvent.click(form.getByText("SEND RFQ"));
    // The two seed cards already carry data-rfq-id, so a bare "[data-rfq-id]"
    // query would pass even if SEND did nothing. Assert the NEWLY sent card
    // specifically: the first sent RFQ takes id RFQ_SEQ_START (700), proving
    // sendRfq prepended it (and switched to the live tab where it shows).
    expect(container.querySelector('[data-rfq-id="700"]')).toBeTruthy();
  });
});

// — helpers ————————————————————————————————————————————————————————————————

function renderCreditScreen(): ReturnType<typeof render> {
  return render(
    <PreferencesProvider>
      <CreditScreen />
    </PreferencesProvider>,
  );
}
