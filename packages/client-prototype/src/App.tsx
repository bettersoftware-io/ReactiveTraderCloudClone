import type { ReactElement } from "react";
import { useState } from "react";

import { AppShell } from "#/shell/AppShell";
import { BootSequence } from "#/shell/Boot/BootSequence";
import type { Tab } from "#/shell/Header/useMenus";
import { LockScreen } from "#/shell/LockScreen/LockScreen";
import { PreferencesModal } from "#/shell/Preferences/PreferencesModal";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { ThemeProvider } from "#/theme/ThemeProvider";

export function App(): ReactElement {
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<Tab>("fx");
  const [lang, setLang] = useState("EN");
  const [loggedOut, setLoggedOut] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <ThemeProvider>
      <PreferencesProvider>
        <AppShell
          tab={tab}
          onSelectTab={setTab}
          lang={lang}
          onSelectLang={setLang}
          onOpenPrefs={() => {
            setPrefsOpen(true);
          }}
          onReboot={() => {
            setBooted(false);
          }}
          onLogout={() => {
            setLoggedOut(true);
          }}
          booted={booted}
        />
        {prefsOpen ? (
          <PreferencesModal
            onClose={() => {
              setPrefsOpen(false);
            }}
          />
        ) : null}
        {loggedOut ? (
          <LockScreen
            onAuthenticate={() => {
              setLoggedOut(false);
            }}
          />
        ) : null}
        {!booted ? (
          <BootSequence
            onDone={() => {
              setBooted(true);
            }}
          />
        ) : null}
      </PreferencesProvider>
    </ThemeProvider>
  );
}
