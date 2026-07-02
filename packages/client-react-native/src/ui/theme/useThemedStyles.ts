// packages/client-react-native/src/ui/theme/useThemedStyles.ts
import { useMemo } from "react";

import { useTheme } from "#/ui/theme/useTheme";
import type { RnTheme } from "#/ui/theme/tokens";

/** Build a StyleSheet from the current theme, recomputing only when the theme
 * object identity changes. `make` is a module-level factory (stable identity),
 * so styles are memoised across renders within one theme. */
export function useThemedStyles<T>(make: (theme: RnTheme) => T): T {
  const theme = useTheme();
  return useMemo(() => {
    return make(theme);
  }, [theme, make]);
}
