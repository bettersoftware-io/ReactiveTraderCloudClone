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

  if (!booted) {
    return (
      <ThemeProvider>
        <BootSequence
          onDone={() => {
            setBooted(true);
          }}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <PreferencesProvider>
        {loggedOut ? (
          <LockScreen
            onAuthenticate={() => {
              setLoggedOut(false);
            }}
          />
        ) : (
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
          />
        )}
        {prefsOpen ? (
          <PreferencesModal
            onClose={() => {
              setPrefsOpen(false);
            }}
          />
        ) : null}
      </PreferencesProvider>
    </ThemeProvider>
  );
}
