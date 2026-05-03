import { ThemeToggle } from "../theme/ThemeToggle";

export type WorkspaceTab = "fx" | "credit" | "admin";

interface HeaderProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header
      data-testid="header"
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
          gap: 16,
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
        <nav style={{ display: "flex", gap: 2 }}>
          {(["fx", "credit", "admin"] as const).map((tab) => (
            <button
              key={tab}
              data-testid={`tab-${tab}`}
              onClick={() => onTabChange(tab)}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                fontWeight: activeTab === tab ? 600 : 400,
                backgroundColor:
                  activeTab === tab ? "var(--accent-primary)" : "transparent",
                color: activeTab === tab ? "#fff" : "var(--text-secondary)",
              }}
            >
              {tab === "fx" ? "FX" : tab === "credit" ? "Credit" : "Admin"}
            </button>
          ))}
        </nav>
      </div>
      <ThemeToggle />
    </header>
  );
}
