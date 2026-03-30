import { ThemeToggle } from "../theme/theme-toggle";

export function Header() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        height: 44,
        backgroundColor: "var(--bg-header)",
        borderBottom: "1px solid var(--border-primary)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: -0.5,
          }}
        >
          Reactive Trader
        </span>
      </div>
      <ThemeToggle />
    </header>
  );
}
