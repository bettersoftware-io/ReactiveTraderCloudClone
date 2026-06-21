import type { Theme } from "@rtc/domain";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
} from "react";
import { useHooks } from "../../hooks/HooksProvider";
import { darkTokens, lightTokens, type ThemeTokens } from "./tokens";

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
  //
  // The DOM writes below (CSS variables on :root + dataset.theme) intentionally
  // STAY here: applying a theme to the document is RENDERING, which is the View's
  // job — not business logic, transport, or persistence (Dumb-UI forbids those,
  // not painting). The token VALUES (darkTokens/lightTokens) are data and the
  // theme CHOICE is a port; only the paint remains, and it is coupled to the WEB
  // render target (`document.documentElement`) — exactly the layer that gets
  // rewritten per target (a SolidJS web app writes the same :root vars; a React
  // Native app applies the theme its own way in its own ThemeProvider). Wrapping
  // this behind a port would be over-abstraction: ports are I/O boundaries, not
  // "how the View paints".
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
