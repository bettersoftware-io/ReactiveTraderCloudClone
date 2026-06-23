import type { ReactElement } from "react";

import { useTheme } from "./useTheme";

import styles from "./ThemeToggle.module.css";

export function ThemeToggle(): ReactElement {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={styles.toggle}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
