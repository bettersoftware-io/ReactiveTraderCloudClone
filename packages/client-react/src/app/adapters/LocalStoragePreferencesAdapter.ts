import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import {
  DEFAULT_THEME,
  DEFAULT_VIEW_MODE,
  type PreferencesPort,
  type Theme,
  type ViewMode,
} from "@rtc/domain";

export const THEME_STORAGE_KEY = "rtc-theme";
export const VIEW_MODE_STORAGE_KEY = "rtc-view-mode";

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

function isViewMode(value: string | null): value is ViewMode {
  return value === "chart" || value === "price";
}

function readStored<T extends string>(
  key: string,
  guard: (value: string | null) => value is T,
  fallback: T,
): T {
  try {
    const stored = localStorage.getItem(key);
    if (guard(stored)) return stored;
  } catch {
    // localStorage may be unavailable (private mode, disabled cookies, etc.)
  }
  return fallback;
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — persistence is best-effort
  }
}

/**
 * localStorage-backed PreferencesPort. Seeds BehaviorSubjects from a synchronous
 * read on construction (validated against the closed unions, falling back to the
 * default on invalid/missing/throwing storage), so subscribers get the current
 * value synchronously — no theme flash. Uses the SAME keys the UI used before
 * Phase 7, so existing users' stored preferences carry over. This is the only
 * localStorage site in the client after Phase 7.
 */
export class LocalStoragePreferencesAdapter implements PreferencesPort {
  private readonly theme: BehaviorSubject<Theme>;
  private readonly viewMode: BehaviorSubject<ViewMode>;

  constructor() {
    this.theme = new BehaviorSubject<Theme>(
      readStored(THEME_STORAGE_KEY, isTheme, DEFAULT_THEME),
    );
    this.viewMode = new BehaviorSubject<ViewMode>(
      readStored(VIEW_MODE_STORAGE_KEY, isViewMode, DEFAULT_VIEW_MODE),
    );
  }

  theme$(): Observable<Theme> {
    return this.theme.pipe(distinctUntilChanged());
  }

  setTheme(theme: Theme): void {
    writeStored(THEME_STORAGE_KEY, theme);
    this.theme.next(theme);
  }

  viewMode$(): Observable<ViewMode> {
    return this.viewMode.pipe(distinctUntilChanged());
  }

  setViewMode(viewMode: ViewMode): void {
    writeStored(VIEW_MODE_STORAGE_KEY, viewMode);
    this.viewMode.next(viewMode);
  }
}
