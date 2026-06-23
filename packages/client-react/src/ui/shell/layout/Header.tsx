import type { ReactElement } from "react";

import { ThemeToggle } from "../theme/ThemeToggle";

import styles from "./Header.module.css";

export type WorkspaceTab = "fx" | "credit" | "admin";

interface HeaderProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

export function Header({ activeTab, onTabChange }: HeaderProps): ReactElement {
  return (
    <header data-testid="header" className={styles.header}>
      <div className={styles.logoGroup}>
        <span className={styles.title}>Reactive Trader</span>
        <nav className={styles.nav}>
          {(["fx", "credit", "admin"] as const).map((tab) => {
            return (
              <button
                key={tab}
                type="button"
                data-testid={`tab-${tab}`}
                data-active={activeTab === tab ? "true" : "false"}
                onClick={() => {
                  return onTabChange(tab);
                }}
                className={styles.navButton}
              >
                {tab === "fx" ? "FX" : tab === "credit" ? "Credit" : "Admin"}
              </button>
            );
          })}
        </nav>
      </div>
      <ThemeToggle />
    </header>
  );
}
