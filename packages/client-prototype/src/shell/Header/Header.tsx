import type { ReactElement } from "react";

import { AccountMenu } from "#/shell/Header/AccountMenu";
import styles from "#/shell/Header/Header.module.css";
import { LanguageMenu } from "#/shell/Header/LanguageMenu";
import { Logo } from "#/shell/Header/Logo";
import { ModeToggle } from "#/shell/Header/ModeToggle";
import { Nav } from "#/shell/Header/Nav";
import { Notifications } from "#/shell/Header/Notifications";
import { StatusPills } from "#/shell/Header/StatusPills";
import { ThemePicker } from "#/shell/Header/ThemePicker";
import type { Tab } from "#/shell/Header/useMenus";
import { useMenus } from "#/shell/Header/useMenus";

export interface HeaderProps {
  tab: Tab;
  onSelectTab(tab: Tab): void;
  lang: string;
  onSelectLang(code: string): void;
  onOpenPrefs(): void;
  onLogout(): void;
  onReboot(): void;
}

export function Header(props: HeaderProps): ReactElement {
  const {
    tab,
    onSelectTab,
    lang,
    onSelectLang,
    onOpenPrefs,
    onLogout,
    onReboot,
  } = props;
  const menus = useMenus();
  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo />
          <div className={styles.wordmark}>
            <div className={styles.wordmarkTitle}>REACTIVE TRADER</div>
            <div className={styles.wordmarkSub}>
              FX · CREDIT · EQUITIES · HUD TERMINAL
            </div>
          </div>
        </div>
        <Nav tab={tab} onSelect={onSelectTab} />
        <div className={styles.spacer} />
        <div className={styles.controls}>
          <StatusPills />
          <ModeToggle />
          <ThemePicker menus={menus} />
          <Notifications menus={menus} />
          <LanguageMenu menus={menus} lang={lang} onSelectLang={onSelectLang} />
          <div className={styles.divider} />
          <AccountMenu
            menus={menus}
            onOpenPrefs={onOpenPrefs}
            onReboot={onReboot}
            onLogout={onLogout}
          />
        </div>
      </header>
      {menus.open !== null && (
        <button
          type="button"
          data-testid="menu-backdrop"
          className={styles.backdrop}
          aria-label="Close menu"
          onClick={menus.close}
        />
      )}
    </>
  );
}
