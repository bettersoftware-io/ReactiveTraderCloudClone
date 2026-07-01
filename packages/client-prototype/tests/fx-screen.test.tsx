import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { FxScreen } from "#/fx/FxScreen";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { ThemeProvider } from "#/theme/ThemeProvider";

afterEach(cleanup);

describe("FxScreen", () => {
  test("renders the FX dock — Live Rates tab and the Analytics/Positions aside", () => {
    renderFxScreen();

    expect(screen.getByTestId("fx-screen")).toBeDefined();
    expect(screen.getByText("◧ Live Rates")).toBeDefined();
    expect(screen.getByText(/Profit & Loss · Today/)).toBeDefined();
    expect(screen.getByText("Net Exposure")).toBeDefined();
  });
});

// — helpers ————————————————————————————————————————————————————————————————

function renderFxScreen(): void {
  render(
    <ThemeProvider>
      <PreferencesProvider>
        <FxScreen />
      </PreferencesProvider>
    </ThemeProvider>,
  );
}
