import type { ReactElement } from "react";

import { AdminScreen } from "#/admin/AdminScreen";
import { CreditScreen } from "#/credit/CreditScreen";
import { EquitiesScreen } from "#/equities/EquitiesScreen";
import { FxScreen } from "#/fx/FxScreen";
import styles from "#/shell/AppShell.module.css";
import { AmbientBackground } from "#/shell/ambient/AmbientBackground";
import { Header } from "#/shell/Header/Header";
import type { Tab } from "#/shell/Header/useMenus";
import { StatusBar } from "#/shell/StatusBar/StatusBar";

export interface AppShellProps {
  tab: Tab;
  onSelectTab(tab: Tab): void;
  lang: string;
  onSelectLang(code: string): void;
  onOpenPrefs(): void;
  onReboot(): void;
  onLogout(): void;
}

export function AppShell(props: AppShellProps): ReactElement {
  const {
    tab,
    onSelectTab,
    lang,
    onSelectLang,
    onOpenPrefs,
    onReboot,
    onLogout,
  } = props;
  return (
    <div className={styles.shell} data-testid="app-shell">
      <AmbientBackground />
      <div className={styles.chrome}>
        <Header
          tab={tab}
          onSelectTab={onSelectTab}
          lang={lang}
          onSelectLang={onSelectLang}
          onOpenPrefs={onOpenPrefs}
          onReboot={onReboot}
          onLogout={onLogout}
        />
        <main className={styles.body}>
          {tab === "fx" ? (
            <FxScreen />
          ) : tab === "credit" ? (
            <CreditScreen />
          ) : tab === "equities" ? (
            <EquitiesScreen />
          ) : (
            <AdminScreen />
          )}
        </main>
        <StatusBar />
      </div>
    </div>
  );
}
