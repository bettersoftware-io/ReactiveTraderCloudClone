// packages/client-react-native/src/ui/theme/ThemeProvider.tsx
import type { JSX, ReactNode } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

/** Resolves the active `skin × mode` cell from the ViewModel's theme
 * preferences and provides it to the tree. The RN analogue of client-react's
 * ThemeProvider — but instead of painting CSS vars on :root, it hands the
 * resolved token object down through React context for leaves to consume via
 * `useTheme` / `useThemedStyles`. Persistence, mode resolution (system → OS),
 * and the skin/mode choice all live behind the ViewModel seam; this only reads
 * the resolved values and selects the token cell. */
export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { mode } = useThemePreference();
  const { skin } = useThemeSkinPreference();

  return (
    <ThemeContext.Provider value={rnThemeTokens[skin][mode]}>
      {children}
    </ThemeContext.Provider>
  );
}

interface ThemeProviderProps {
  children: ReactNode;
}
