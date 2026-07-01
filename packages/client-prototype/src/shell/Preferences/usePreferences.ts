import { createContext, useContext } from "react";

import type { Prefs, SegmentKey } from "#/shell/Preferences/prefs";

export interface PreferencesContextValue {
  prefs: Prefs;
  setPref(key: SegmentKey | "uiScale", value: string | number): void;
  togglePref(key: keyof Prefs): void;
  ambPlay: "running" | "paused";
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(
  null,
);

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);

  if (!value) {
    throw new Error("usePreferences must be used within <PreferencesProvider>");
  }

  return value;
}
