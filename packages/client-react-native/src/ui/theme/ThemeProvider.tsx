// packages/client-react-native/src/ui/theme/ThemeProvider.tsx
import type { JSX, ReactNode } from "react";
import { useMemo } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { SYSTEM_MONO } from "#/ui/theme/platformFonts";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

/** Resolves the active `skin × mode` cell from the ViewModel's theme
 * preferences and provides it to the tree. The RN analogue of client-react's
 * ThemeProvider — but instead of painting CSS vars on :root, it hands the
 * resolved token object down through React context for leaves to consume via
 * `useTheme` / `useThemedStyles`. Persistence, mode resolution (system → OS),
 * and the skin/mode choice all live behind the ViewModel seam; this only reads
 * the resolved values, selects the token cell, and fills the platform system
 * monospace for skins (classic) that bundle no mono font. */
export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { mode } = useThemePreference();
  const { skin } = useThemeSkinPreference();
  const theme = useMemo(() => {
    return withPlatformMono(rnThemeTokens[skin][mode]);
  }, [skin, mode]);

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

interface ThemeProviderProps {
  children: ReactNode;
}

/** A cell whose `fontMono` is `undefined` (classic) means "the platform system
 * monospace"; fill it here. Cells that already name a bundled family are
 * returned unchanged (stable identity), so `useThemedStyles`'s memo only busts
 * when the skin/mode actually changes. */
function withPlatformMono(cell: RnTheme): RnTheme {
  if (cell.fontMono !== undefined) {
    return cell;
  }

  return { ...cell, fontMono: SYSTEM_MONO };
}
