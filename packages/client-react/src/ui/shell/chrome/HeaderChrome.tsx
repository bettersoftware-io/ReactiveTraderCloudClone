import { type ReactElement, useState } from "react";

import { HudLogo } from "../logo/HudLogo";
import { PreferencesModal } from "../prefs/PreferencesModal";
import { AccountMenu } from "./AccountMenu";
import { EnvBadge } from "./EnvBadge";
import { LanguageMenu } from "./LanguageMenu";
import { NavTab, type WorkspaceTab } from "./NavTab";
import { NotificationsMenu } from "./NotificationsMenu";
import { PowerSaverToggle } from "./PowerSaverToggle";
import { ThemePicker } from "./ThemePicker";

import styles from "./HeaderChrome.module.css";

/**
 * HUD header chrome — animated logo + wordmark + workspace nav + LIVE
 * indicator + env badge + theme picker (skin + mode) + notifications +
 * account menu. Ported from the prototype header (Reactive
 * Trader.dc.html:107-217) to CSS-module markup with `var(--token)` colours.
 * The Preferences modal opens from the account menu's ⚙ Preferences row
 * (prototype parity — no standalone gear button); its open state lives here.
 *
 * All four nav tabs (FX, Credit, Equities, Admin) are live workspace tabs —
 * one NavTab component each (see NavTab.tsx for the testid/data-active
 * contract). Equities was added as a full tab in Phase 4.
 */
export function HeaderChrome({
  activeTab,
  onTabChange,
}: HeaderChromeProps): ReactElement {
  // Local view-state only (which UI panel is open) — not business logic, so a
  // plain useState is correct here, no port involved.
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <header data-testid="header" className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logoWrap} aria-hidden="true">
          <HudLogo />
        </span>
        <span className={styles.brandText}>
          <span className={styles.wordmark}>REACTIVE TRADER</span>
          <span className={styles.subtitle}>
            FX · CREDIT · EQUITIES · HUD TERMINAL
          </span>
        </span>
      </div>

      <nav className={styles.nav} aria-label="Workspace">
        <NavTab tab="fx" active={activeTab === "fx"} onSelect={onTabChange} />
        <NavTab
          tab="credit"
          active={activeTab === "credit"}
          onSelect={onTabChange}
        />
        <NavTab
          tab="equities"
          active={activeTab === "equities"}
          onSelect={onTabChange}
        />
        <NavTab
          tab="admin"
          active={activeTab === "admin"}
          onSelect={onTabChange}
        />
      </nav>

      <div className={styles.spacer} />

      <div className={styles.actions}>
        <div className={styles.live}>
          <span className={styles.liveDot} />
          <span className={styles.liveLabel}>LIVE</span>
        </div>
        <EnvBadge />
        <PowerSaverToggle />
        <ThemePicker />
        <NotificationsMenu />
        <LanguageMenu />
        <span className={styles.divider} />
        <AccountMenu
          onOpenPrefs={() => {
            setPrefsOpen(true);
          }}
        />
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

// Re-exported so existing consumers (App.tsx) keep importing the workspace-tab
// type from the header, while its definition lives beside NavTab.
export type { WorkspaceTab } from "./NavTab";

interface HeaderChromeProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}
