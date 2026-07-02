// packages/client-react-native/src/ui/theme/renderWithTheme.tsx
import { type RenderResult, render } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { ThemeContext } from "#/ui/theme/ThemeContext";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

/** Render a leaf under a fixed theme (default: holo/dark) without a ViewModel —
 * leaves consume `useTheme`/`ThemeContext`, not the provider, so tests inject
 * the theme directly. Returns the RNTL result plus the theme used, so colour
 * assertions can reference the exact cell. */
export function renderWithTheme(
  ui: ReactElement,
  theme: RnTheme = rnThemeTokens.holo.dark,
): Promise<RenderResult> {
  return render(
    <ThemeContext.Provider value={theme}>{ui}</ThemeContext.Provider>,
  );
}
