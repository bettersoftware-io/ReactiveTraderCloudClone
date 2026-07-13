import type { JSX } from "solid-js";

import { nextThemeModePreference, type ThemeModePreference } from "@rtc/domain";

import { useTheme } from "./useTheme";

import styles from "./ThemeToggle.module.css";

export function ThemeToggle(): JSX.Element {
  const { modePreference, cycleMode } = useTheme();

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-mode-preference={modePreference()}
      onClick={cycleMode}
      aria-label={`Switch to ${nextThemeModePreference(modePreference())} theme`}
      title={`Switch to ${nextThemeModePreference(modePreference())} theme`}
      class={styles.toggle}
    >
      {ICON[modePreference()]}
    </button>
  );
}

// Icon per stored preference. dark→☀️ / light→🌙 are unchanged from the
// two-state toggle (so existing goldens are byte-identical); system→🖥️ is new.
const ICON: Record<ThemeModePreference, string> = {
  dark: "☀️",
  light: "🌙",
  system: "🖥️",
};
