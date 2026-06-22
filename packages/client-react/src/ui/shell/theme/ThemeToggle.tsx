import styles from "./ThemeToggle.module.css";
import { useTheme } from "./useTheme";

export function ThemeToggle() {
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
