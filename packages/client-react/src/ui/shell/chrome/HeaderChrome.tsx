import { type ReactElement, useState } from "react";

import { PreferencesModal } from "../prefs/PreferencesModal";
import { AccountMenu } from "./AccountMenu";
import { EnvBadge } from "./EnvBadge";
import { LanguageMenu } from "./LanguageMenu";
import { NotificationsMenu } from "./NotificationsMenu";
import { ThemePicker } from "./ThemePicker";

import styles from "./HeaderChrome.module.css";

/**
 * HUD header chrome — wordmark + workspace nav + LIVE indicator + env badge +
 * theme picker (skin + mode) + notifications + account menu. Ported from the
 * prototype header (Reactive Trader.dc.html:107-217) to CSS-module markup with
 * `var(--token)` colours.
 *
 * All four nav tabs (FX, Credit, Equities, Admin) are live workspace tabs.
 * Each renders with `data-testid="tab-{tab}"`, `data-active`, and calls
 * `onTabChange` on click — keeping the Cypress workspace contract intact for
 * all four workspaces. Equities was added as a full tab in Phase 4.
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
        <span className={styles.logoMark} aria-hidden="true">
          ⬡
        </span>
        <span className={styles.brandText}>
          <span className={styles.wordmark}>REACTIVE TRADER</span>
          <span className={styles.subtitle}>
            FX · CREDIT · EQUITIES · HUD TERMINAL
          </span>
        </span>
      </div>

      <nav className={styles.nav} aria-label="Workspace">
        {renderTab("fx")}
        {renderTab("credit")}
        {renderTab("equities")}
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
        <LanguageMenu />
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

/** The four real workspace tabs the shell switches between. Equities added in
 *  Phase 4; the e2e Workspace page object clicks `tab-${tab}`. */
export type WorkspaceTab = "fx" | "credit" | "admin" | "equities";

const TAB_LABEL: Record<WorkspaceTab, string> = {
  fx: "FX",
  credit: "Credit",
  admin: "Admin",
  equities: "Equities",
};

interface HeaderChromeProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}
