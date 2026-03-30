import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      style={{
        background: "none",
        border: "1px solid var(--border-primary)",
        borderRadius: 4,
        color: "var(--text-primary)",
        cursor: "pointer",
        padding: "4px 8px",
        fontSize: 14,
      }}
    >
      {theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19"}
    </button>
  );
}
