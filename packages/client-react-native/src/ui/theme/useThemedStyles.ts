// packages/client-react-native/src/ui/theme/useThemedStyles.ts
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

/** Build a StyleSheet from the current theme. `make` is a module-level
 * factory (stable identity); the React Compiler memoises this call keyed on
 * `theme` + `make`, and `theme`'s identity is already stable per `skin × mode`
 * cell (see `ThemeProvider`'s `RESOLVED_THEMES`), so the practical caching
 * behaviour is unchanged from the hand-rolled `useMemo` this replaces. */
export function useThemedStyles<T>(make: (theme: RnTheme) => T): T {
  const theme = useTheme();

  return make(theme);
}
