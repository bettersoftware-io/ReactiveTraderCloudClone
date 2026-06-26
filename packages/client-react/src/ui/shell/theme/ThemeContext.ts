import { createContext } from "react";

import type { ThemeMode, ThemeSkin } from "@rtc/domain";

export interface ThemeContextValue {
  skin: ThemeSkin;
  mode: ThemeMode;
  setSkin: (skin: ThemeSkin) => void;
  toggleMode: () => void;
}

/** Theme seam context. Split from the provider so `useTheme` consumers don't
 * transitively import the ThemeProvider component (and its DOM-painting effect). */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
