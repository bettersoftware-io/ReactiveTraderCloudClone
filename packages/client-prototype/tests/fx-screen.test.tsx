import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { FxScreen } from "#/fx/FxScreen";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { ThemeProvider } from "#/theme/ThemeProvider";

afterEach(cleanup);

describe("FxScreen", () => {
  test("renders the FX dock — Live Rates tab and the P2.5 aside placeholders", () => {
    renderFxScreen();

    expect(screen.getByTestId("fx-screen")).toBeDefined();
    expect(screen.getByText("◧ Live Rates")).toBeDefined();
    expect(screen.getByText(/Analytics · P2\.5/)).toBeDefined();
    expect(screen.getByText(/Positions · P2\.5/)).toBeDefined();
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
