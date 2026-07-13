import type { Accessor } from "solid-js";
import { createContext } from "solid-js";

import type { ThemeMode, ThemeModePreference, ThemeSkin } from "@rtc/domain";

export interface ThemeContextValue {
  skin: Accessor<ThemeSkin>;
  /** The resolved mode that paints (system already collapsed to dark | light). */
  mode: Accessor<ThemeMode>;
  /** The stored choice (dark | light | system) — drives the toggle's icon. */
  modePreference: Accessor<ThemeModePreference>;
  setSkin: (skin: ThemeSkin) => void;
  /** Advance the mode preference one step: dark → light → system → dark. */
  cycleMode: () => void;
}

/** Theme seam context. Split from the provider so `useTheme` consumers don't
 * transitively import the ThemeProvider component (and its DOM-painting effect). */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
