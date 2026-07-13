import type { JSX } from "solid-js";
import { createSignal } from "solid-js";

import { HudLogo } from "../logo/HudLogo";
import { PreferencesModal } from "../prefs/PreferencesModal";
import { AccountMenu } from "./AccountMenu";
import { EnvBadge } from "./EnvBadge";
import { LanguageMenu } from "./LanguageMenu";
import { NavTab, type WorkspaceTab } from "./NavTab";
import { NotificationsMenu } from "./NotificationsMenu";
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
export function HeaderChrome(props: HeaderChromeProps): JSX.Element {
  // Local view-state only (which UI panel is open) — not business logic, so a
  // plain createSignal is correct here, no port involved.
  const [prefsOpen, setPrefsOpen] = createSignal(false);

  return (
    <header data-testid="header" class={styles.header}>
      <div class={styles.brand}>
        <span class={styles.logoWrap} aria-hidden="true">
          <HudLogo />
        </span>
        <span class={styles.brandText}>
          <span class={styles.wordmark}>REACTIVE TRADER</span>
          <span class={styles.subtitle}>
            FX · CREDIT · EQUITIES · HUD TERMINAL
          </span>
        </span>
      </div>

      <nav class={styles.nav} aria-label="Workspace">
        <NavTab
          tab="fx"
          active={props.activeTab === "fx"}
          onSelect={props.onTabChange}
        />
        <NavTab
          tab="credit"
          active={props.activeTab === "credit"}
          onSelect={props.onTabChange}
        />
        <NavTab
          tab="equities"
          active={props.activeTab === "equities"}
          onSelect={props.onTabChange}
        />
        <NavTab
          tab="admin"
          active={props.activeTab === "admin"}
          onSelect={props.onTabChange}
        />
      </nav>

      <div class={styles.spacer} />

      <div class={styles.actions}>
        <div class={styles.live}>
          <span class={styles.liveDot} />
          <span class={styles.liveLabel}>LIVE</span>
        </div>
        <EnvBadge />
        <ThemePicker />
        <NotificationsMenu />
        <LanguageMenu />
        <span class={styles.divider} />
        <AccountMenu
          onOpenPrefs={() => {
            setPrefsOpen(true);
          }}
        />
      </div>
      <PreferencesModal
        open={prefsOpen()}
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
