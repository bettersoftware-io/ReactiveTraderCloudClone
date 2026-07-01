import type { ReactElement } from "react";

import styles from "#/shell/Header/ModeToggle.module.css";
import { useTheme } from "#/theme/useTheme";

export function ModeToggle(): ReactElement {
  const { mode, toggleMode } = useTheme();
  const label = `Switch to ${mode === "light" ? "dark" : "light"} mode`;
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={label}
      title={label}
      onClick={toggleMode}
    >
      {mode === "light" ? "☾" : "☀"}
    </button>
  );
}
