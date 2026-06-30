import type { ReactElement } from "react";

import styles from "#/shell/Header/Header.module.css";
import { Logo } from "#/shell/Header/Logo";
import { ModeToggle } from "#/shell/Header/ModeToggle";
import { Nav } from "#/shell/Header/Nav";
import { StatusPills } from "#/shell/Header/StatusPills";
import { ThemePicker } from "#/shell/Header/ThemePicker";
import type { Tab } from "#/shell/Header/useMenus";
import { useMenus } from "#/shell/Header/useMenus";

export interface HeaderProps {
  tab: Tab;
  onSelectTab(tab: Tab): void;
}

export function Header(props: HeaderProps): ReactElement {
  const { tab, onSelectTab } = props;
  const menus = useMenus();
  return (
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
      </div>
    </header>
  );
}
