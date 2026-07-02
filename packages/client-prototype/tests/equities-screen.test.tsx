import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EquitiesScreen } from "#/equities/EquitiesScreen";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe("EquitiesScreen", () => {
  test("composes the four panels", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("equities-screen")).toBeTruthy();
  });

  test("submitting from the ticket books an order row", () => {
    const { container, getByText } = renderScreen();
    fireEvent.click(getByText(/BUY AAPL/));
    expect(container.querySelector('[data-order-id="5001"]')).toBeTruthy();
  });
});

function renderScreen(): ReturnType<typeof render> {
  return render(
    <PreferencesProvider>
      <EquitiesScreen />
    </PreferencesProvider>,
  );
}
