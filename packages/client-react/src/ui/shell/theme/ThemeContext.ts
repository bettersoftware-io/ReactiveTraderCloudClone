import type { Theme } from "@rtc/domain";
import { createContext } from "react";

export interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

/** Theme seam context. Split from the provider so `useTheme` consumers don't
 * transitively import the ThemeProvider component (and its DOM-painting effect). */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
