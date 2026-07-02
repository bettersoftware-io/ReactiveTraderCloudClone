import { cleanup, fireEvent, render } from "@testing-library/react";
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
    vi.useFakeTimers();
    const { getByText, getByRole, getByPlaceholderText, container } =
      renderCreditScreen();
    // Both the seeded closed RFQ card (RfqCard's plain ticker/bank spans)
    // and the New RFQ form share text with the seed data ("MSFT 3.3 02/27",
    // "Citi") once mounted together in the full screen — getByRole narrows
    // to the interactive picker/checklist buttons, which the seeded card's
    // read-only spans aren't.
    fireEvent.click(getByText("Select instrument"));
    fireEvent.click(getByRole("button", { name: /MSFT 3\.3 02\/27/ }));
    fireEvent.change(getByPlaceholderText("0"), { target: { value: "500" } });
    fireEvent.click(getByRole("button", { name: "Citi" }));
    fireEvent.click(getByText("SEND RFQ"));
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
