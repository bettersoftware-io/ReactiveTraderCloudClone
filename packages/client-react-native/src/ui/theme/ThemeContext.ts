// packages/client-react-native/src/ui/theme/ThemeContext.ts
import { createContext } from "react";

import type { RnTheme } from "#/ui/theme/tokens";

/** The resolved theme for the current skin × mode. `null` outside a provider —
 * `useTheme` turns that into a thrown error. */
export const ThemeContext = createContext<RnTheme | null>(null);
