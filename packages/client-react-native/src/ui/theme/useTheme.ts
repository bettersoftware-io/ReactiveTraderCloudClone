// packages/client-react-native/src/ui/theme/useTheme.ts
import { useContext } from "react";

import { ThemeContext } from "#/ui/theme/ThemeContext";
import type { RnTheme } from "#/ui/theme/tokens";

export function useTheme(): RnTheme {
  const theme = useContext(ThemeContext);

  if (theme === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return theme;
}
