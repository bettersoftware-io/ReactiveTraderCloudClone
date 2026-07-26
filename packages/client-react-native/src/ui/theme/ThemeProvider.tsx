// packages/client-react-native/src/ui/theme/ThemeProvider.tsx
import type { JSX, ReactNode } from "react";

import type { ThemeMode, ThemeSkin } from "@rtc/domain";
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
 * the resolved values and selects the pre-resolved token cell (platform
 * system monospace already filled in — see `RESOLVED_THEMES` below). */
export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { mode } = useThemePreference();
  const { skin } = useThemeSkinPreference();
  const theme = RESOLVED_THEMES[skin][mode];

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

interface ThemeProviderProps {
  children: ReactNode;
}

/** A cell whose `fontMono` is `undefined` (classic) means "the platform system
 * monospace"; fill it here. Cells that already name a bundled family are
 * returned unchanged (stable identity). */
function withPlatformMono(cell: RnTheme): RnTheme {
  if (cell.fontMono !== undefined) {
    return cell;
  }

  return { ...cell, fontMono: SYSTEM_MONO };
}

/** Every `skin × mode` cell with its platform mono filled in, resolved once at
 * module load. A lookup beats a `useMemo` here on two counts: identity is
 * stable for the process lifetime rather than per-mount, and it does not depend
 * on the React Compiler — which bails on this component anyway, because reading
 * hooks off the ViewModel seam defeats static hook identity. Stable identity
 * matters: this value is a context value, so a fresh object per render would
 * re-render every themed leaf. */
const RESOLVED_THEMES = resolveAllThemes();

function resolveAllThemes(): Record<ThemeSkin, Record<ThemeMode, RnTheme>> {
  const resolved = {} as Record<ThemeSkin, Record<ThemeMode, RnTheme>>;

  for (const skin of Object.keys(rnThemeTokens) as ThemeSkin[]) {
    const byMode = {} as Record<ThemeMode, RnTheme>;

    for (const mode of Object.keys(rnThemeTokens[skin]) as ThemeMode[]) {
      byMode[mode] = withPlatformMono(rnThemeTokens[skin][mode]);
    }

    resolved[skin] = byMode;
  }

  return resolved;
}
