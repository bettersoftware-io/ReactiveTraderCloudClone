import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Mode, Skin } from "#/mock/types";
import { tokensToCssVars } from "#/theme/themeVars";
import { themesDark, themesLight } from "#/theme/tokens";
import { ThemeContext } from "#/theme/useTheme";

const SKIN_KEY = "rt_skin";
const MODE_KEY = "rt_mode";

export interface ThemeProviderProps {
  children: ReactNode;
  initialSkin?: Skin;
}

function readSkin(fallback: Skin): Skin {
  const stored = localStorage.getItem(SKIN_KEY);
  const valid: Skin[] = ["holo", "holo3d", "terminal", "terminal3d", "neon"];
  return stored && valid.includes(stored as Skin) ? (stored as Skin) : fallback;
}

function readMode(): Mode {
  return localStorage.getItem(MODE_KEY) === "light" ? "light" : "dark";
}

export function ThemeProvider(props: ThemeProviderProps): ReactElement {
  const { children, initialSkin = "holo" } = props;
  const [skin, setSkinState] = useState<Skin>(() => {
    return readSkin(initialSkin);
  });
  const [mode, setMode] = useState<Mode>(() => {
    return readMode();
  });

  const tokens = useMemo(() => {
    const set = mode === "light" ? themesLight : themesDark;
    return set[skin];
  }, [skin, mode]);

  useEffect(() => {
    const root = document.documentElement;
    const vars = tokensToCssVars(tokens);

    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }

    root.style.background = tokens.bg;
    root.style.color = tokens.text;
  }, [tokens]);

  const setSkin = useCallback((next: Skin) => {
    setSkinState(next);
    localStorage.setItem(SKIN_KEY, next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(MODE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => {
    return { skin, mode, tokens, setSkin, toggleMode };
  }, [skin, mode, tokens, setSkin, toggleMode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
