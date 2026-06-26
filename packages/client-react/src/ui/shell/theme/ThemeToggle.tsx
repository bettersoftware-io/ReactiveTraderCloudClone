import type { ReactElement } from "react";

import { useTheme } from "./useTheme";

import styles from "./ThemeToggle.module.css";

export function ThemeToggle(): ReactElement {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggleMode}
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} theme`}
      className={styles.toggle}
    >
      {mode === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
