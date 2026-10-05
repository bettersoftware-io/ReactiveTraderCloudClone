import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_PREFS,
  type Prefs,
  type SegmentKey,
} from "#/shell/Preferences/prefs";
import { PreferencesContext } from "#/shell/Preferences/usePreferences";

export interface PreferencesProviderProps {
  children: ReactNode;
}

export function PreferencesProvider(
  props: PreferencesProviderProps,
): ReactElement {
  const { children } = props;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  const ambPlay: "running" | "paused" =
    prefs.animatedBg && !prefs.reduceMotion ? "running" : "paused";

  useEffect(() => {
    document.documentElement.style.setProperty("--amb-play", ambPlay);
  }, [ambPlay]);

  const setPref = useCallback(
    (key: SegmentKey | "uiScale", value: string | number) => {
      setPrefs((prev) => {
        return { ...prev, [key]: value };
      });
    },
    [],
  );

  const togglePref = useCallback((key: keyof Prefs) => {
    setPrefs((prev) => {
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const value = useMemo(() => {
    return { prefs, setPref, togglePref, ambPlay };
  }, [prefs, setPref, togglePref, ambPlay]);

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}
