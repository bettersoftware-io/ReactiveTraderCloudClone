import { createContext, useContext } from "react";

import type { Mode, Skin, ThemeTokens } from "#/mock/types";

export interface ThemeContextValue {
  skin: Skin;
  mode: Mode;
  tokens: ThemeTokens;
  setSkin(skin: Skin): void;
  toggleMode(): void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }

  return value;
}
