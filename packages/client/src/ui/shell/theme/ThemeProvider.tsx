import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { useHooks } from "../../hooks/HooksProvider";
import { darkTokens, lightTokens, type ThemeTokens } from "./tokens";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTokens(tokens: ThemeTokens) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(tokens)) {
    root.style.setProperty(prop, value);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Persistence/state lives behind the seam (PreferencesPort); the provider
  // only reads the current theme and paints the CSS tokens for it.
  const { theme, toggle } = useHooks().useThemePreference();

  useLayoutEffect(() => {
    applyTokens(theme === "dark" ? darkTokens : lightTokens);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
