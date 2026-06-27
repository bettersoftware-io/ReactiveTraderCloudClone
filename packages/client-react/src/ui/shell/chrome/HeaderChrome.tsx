import { type ReactElement, useState } from "react";

import { PreferencesModal } from "../prefs/PreferencesModal";
import { AccountMenu } from "./AccountMenu";
import { EnvBadge } from "./EnvBadge";
import { NotificationsMenu } from "./NotificationsMenu";
import { ThemePicker } from "./ThemePicker";

import styles from "./HeaderChrome.module.css";

/** The three real workspace tabs the shell switches between. Unchanged from the
 *  superseded Header — the e2e Workspace page object clicks `tab-${tab}`. */
export type WorkspaceTab = "fx" | "credit" | "admin";

const TAB_LABEL: Record<WorkspaceTab, string> = {
  fx: "FX",
  credit: "Credit",
  admin: "Admin",
};

interface HeaderChromeProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

/**
 * HUD header chrome — wordmark + workspace nav + LIVE indicator + env badge +
 * theme picker (skin + mode) + notifications + account menu. Ported from the
 * prototype header (Reactive Trader.dc.html:107-217) to CSS-module markup with
 * `var(--token)` colours.
 *
 * The three real nav tabs keep the superseded Header's contract verbatim
 * (`data-testid="tab-{fx|credit|admin}"`, `data-active`, `onTabChange`, labels
 * FX/Credit/Admin) so the x86 Cypress workspace scenarios stay green. The
 * "Equities" item is decorative and non-wired (Phase 4 builds equities); it
 * carries no `tab-*` testid and never calls `onTabChange`.
 */
export function HeaderChrome({
  activeTab,
  onTabChange,
}: HeaderChromeProps): ReactElement {
  // Local view-state only (which UI panel is open) — not business logic, so a
  // plain useState is correct here, no port involved.
  const [prefsOpen, setPrefsOpen] = useState(false);

  function renderTab(tab: WorkspaceTab): ReactElement {
    const active = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        data-testid={`tab-${tab}`}
        data-active={active ? "true" : "false"}
        className={styles.navButton}
        onClick={() => {
          onTabChange(tab);
        }}
      >
        {TAB_LABEL[tab]}
      </button>
    );
  }

  return (
    <header data-testid="header" className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.wordmark}>REACTIVE TRADER</span>
        <span className={styles.subtitle}>FX · CREDIT · EQUITIES · HUD</span>
      </div>

      <nav className={styles.nav} aria-label="Workspace">
        {renderTab("fx")}
        {renderTab("credit")}
        {/* DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit). */}
        <span
          data-testid="nav-equities"
          aria-disabled="true"
          className={styles.navDisabled}
        >
          Equities
        </span>
        {renderTab("admin")}
      </nav>

      <div className={styles.spacer} />

      <div className={styles.actions}>
        <div className={styles.live}>
          <span className={styles.liveDot} />
          <span className={styles.liveLabel}>LIVE</span>
        </div>
        <EnvBadge />
        <ThemePicker />
        <NotificationsMenu />
        <button
          type="button"
          data-testid="settings-toggle"
          aria-label="Open preferences"
          className={styles.iconButton}
          onClick={() => {
            setPrefsOpen(true);
          }}
        >
          <span className={styles.gear} aria-hidden="true">
            ⚙
          </span>
        </button>
        <span className={styles.divider} />
        <AccountMenu />
      </div>
      <PreferencesModal
        open={prefsOpen}
        onClose={() => {
          setPrefsOpen(false);
        }}
      />
    </header>
  );
}
