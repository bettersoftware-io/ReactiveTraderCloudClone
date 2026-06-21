import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";
import type { PreferencesPort } from "../ports/preferencesPort.js";
import {
  DEFAULT_THEME,
  DEFAULT_VIEW_MODE,
  type Theme,
  type ViewMode,
} from "../preferences/preferences.js";

export interface PreferencesSeed {
  theme?: Theme;
  viewMode?: ViewMode;
}

/**
 * In-memory PreferencesPort backed by BehaviorSubjects, so each stream replays
 * the current value synchronously on subscribe. For domain tests and fakes only;
 * real browser persistence uses the localStorage adapter in the client package.
 */
export class PreferencesSimulator implements PreferencesPort {
  private readonly theme: BehaviorSubject<Theme>;
  private readonly viewMode: BehaviorSubject<ViewMode>;

  constructor(seed: PreferencesSeed = {}) {
    this.theme = new BehaviorSubject<Theme>(seed.theme ?? DEFAULT_THEME);
    this.viewMode = new BehaviorSubject<ViewMode>(
      seed.viewMode ?? DEFAULT_VIEW_MODE,
    );
  }

  theme$(): Observable<Theme> {
    return this.theme.pipe(distinctUntilChanged());
  }

  setTheme(theme: Theme): void {
    this.theme.next(theme);
  }

  viewMode$(): Observable<ViewMode> {
    return this.viewMode.pipe(distinctUntilChanged());
  }

  setViewMode(viewMode: ViewMode): void {
    this.viewMode.next(viewMode);
  }
}
