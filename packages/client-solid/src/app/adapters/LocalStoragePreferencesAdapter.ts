import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import {
  AMBIENT_STYLES,
  type AmbientStyle,
  BOOT_VARIANTS,
  type BootVariant,
  CHART_SUBSTRATES,
  type ChartSubstrate,
  type CreditRfqFilter,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_ANIMATED_BACKGROUND,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CHART_SUBSTRATE,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_NARRATOR,
  DEFAULT_JARVIS_SKIN,
  DEFAULT_LAYOUT_ENGINE,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_LOGIN_WAIT_VARIANT,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  EQ_WATCHLIST_SORTS,
  type EqBlotterView,
  type EqWatchlistSort,
  isJarvisBrain,
  isJarvisEffort,
  isJarvisNarratorPreference,
  isPowerSaverLevel,
  JARVIS_SKINS,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisNarratorPreference,
  type JarvisSkin,
  LAYOUT_ENGINES,
  type LayoutEngine,
  LOGIN_WAIT_DELAYS,
  LOGIN_WAIT_STYLES,
  LOGIN_WAIT_VARIANTS,
  type LoginWaitDelay,
  type LoginWaitStyle,
  type LoginWaitVariant,
  type PowerSaverLevel,
  type PreferencesPort,
  THEME_SKINS,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "@rtc/domain";

export const THEME_STORAGE_KEY = "rtc-theme"; // legacy key → mode (back-compat)
export const THEME_SKIN_STORAGE_KEY = "rtc-theme-skin";
export const VIEW_MODE_STORAGE_KEY = "rtc-view-mode";
export const ANIMATED_BG_STORAGE_KEY = "rtc-animated-bg";
export const POWER_SAVER_STORAGE_KEY = "rtc-power-saver";
export const FORCE_BOOT_ANIMATION_STORAGE_KEY = "rtc-force-boot-animation";
export const BOOT_VARIANT_STORAGE_KEY = "rt-boot-variant";
export const LOGIN_WAIT_VARIANT_STORAGE_KEY = "rt-login-wait-variant";
export const LOGIN_WAIT_STYLE_STORAGE_KEY = "rt-login-wait-style";
export const LOGIN_WAIT_DELAY_STORAGE_KEY = "rt-login-wait-delay";
export const CREDIT_RFQ_FILTER_STORAGE_KEY = "credit-rfqs-filter";
export const EQ_WATCHLIST_SORT_STORAGE_KEY = "eq-watchlist-sort";
export const EQ_BLOTTER_VIEW_STORAGE_KEY = "eq-blotter-view";
export const AMBIENT_STYLE_STORAGE_KEY = "rtc-ambient-style";
export const CHART_SUBSTRATE_STORAGE_KEY = "rtc-chart-substrate";
export const LAYOUT_ENGINE_STORAGE_KEY = "rtc-layout-engine";
export const JARVIS_SKIN_STORAGE_KEY = "rtc-jarvis-skin";
export const JARVIS_BRAIN_STORAGE_KEY = "rt-jarvis-brain";
export const JARVIS_EFFORT_STORAGE_KEY = "rt-jarvis-effort";
export const JARVIS_NARRATOR_STORAGE_KEY = "rt-jarvis-narrator";

function isThemeModePreference(
  value: string | null,
): value is ThemeModePreference {
  return value === "dark" || value === "light" || value === "system";
}

function isAmbientStyle(value: string | null): value is AmbientStyle {
  return (
    value !== null && (AMBIENT_STYLES as readonly string[]).includes(value)
  );
}

function isChartSubstrate(value: string | null): value is ChartSubstrate {
  return (
    value !== null && (CHART_SUBSTRATES as readonly string[]).includes(value)
  );
}

function isLayoutEngine(value: string | null): value is LayoutEngine {
  return (
    value !== null && (LAYOUT_ENGINES as readonly string[]).includes(value)
  );
}

function isJarvisSkin(value: string | null): value is JarvisSkin {
  return value !== null && (JARVIS_SKINS as readonly string[]).includes(value);
}

function isThemeSkin(value: string | null): value is ThemeSkin {
  return value !== null && (THEME_SKINS as readonly string[]).includes(value);
}

function isViewMode(value: string | null): value is ViewMode {
  return value === "chart" || value === "price";
}

function isBootVariant(value: string | null): value is BootVariant {
  return value !== null && (BOOT_VARIANTS as readonly string[]).includes(value);
}

function isLoginWaitVariant(value: string | null): value is LoginWaitVariant {
  return (
    value !== null && (LOGIN_WAIT_VARIANTS as readonly string[]).includes(value)
  );
}

function isLoginWaitStyle(value: string | null): value is LoginWaitStyle {
  return (
    value !== null && (LOGIN_WAIT_STYLES as readonly string[]).includes(value)
  );
}

function isLoginWaitDelay(value: string | null): value is LoginWaitDelay {
  return (
    value !== null && (LOGIN_WAIT_DELAYS as readonly string[]).includes(value)
  );
}

function isCreditRfqFilter(value: string | null): value is CreditRfqFilter {
  return value === "live" || value === "closed" || value === "all";
}

function isEqWatchlistSort(value: string | null): value is EqWatchlistSort {
  return (
    value !== null && (EQ_WATCHLIST_SORTS as readonly string[]).includes(value)
  );
}

function isEqBlotterView(value: string | null): value is EqBlotterView {
  return value === "orders" || value === "positions";
}

function readStored<T extends string>(
  key: string,
  guard: (value: string | null) => value is T,
  fallback: T,
): T {
  try {
    const stored = localStorage.getItem(key);

    if (guard(stored)) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (private mode, disabled cookies, etc.)
  }

  return fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);

    if (stored === "true") {
      return true;
    }

    if (stored === "false") {
      return false;
    }
  } catch {
    // ignore — best-effort read
  }

  return fallback;
}

function readPowerSaverLevel(key: string): PowerSaverLevel {
  try {
    const stored = localStorage.getItem(key);

    if (isPowerSaverLevel(stored)) {
      return stored;
    }

    // Legacy boolean value from the pre-Freeze single toggle.
    if (stored === "true") {
      return "calm";
    }
  } catch {
    // ignore — best-effort read
  }

  return DEFAULT_POWER_SAVER_LEVEL;
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
 * value synchronously — no theme flash. The legacy `"rtc-theme"` key continues to
 * carry the MODE so existing users' stored preference survives the skin×mode
 * split; skin and animated-background live under their own keys. This is the only
 * localStorage site in the client.
 */
export class LocalStoragePreferencesAdapter implements PreferencesPort {
  private readonly themeMode: BehaviorSubject<ThemeModePreference>;

  private readonly themeSkin: BehaviorSubject<ThemeSkin>;

  private readonly viewMode: BehaviorSubject<ViewMode>;

  private readonly animatedBg: BehaviorSubject<boolean>;

  private readonly powerSaverSubject: BehaviorSubject<PowerSaverLevel>;

  private readonly forceBootAnimationSubject: BehaviorSubject<boolean>;

  private readonly bootVariantSubject: BehaviorSubject<BootVariant>;

  private readonly loginWaitVariantSubject: BehaviorSubject<LoginWaitVariant>;

  private readonly loginWaitStyleSubject: BehaviorSubject<LoginWaitStyle>;

  private readonly loginWaitDelaySubject: BehaviorSubject<LoginWaitDelay>;

  private readonly creditRfqFilterSubject: BehaviorSubject<CreditRfqFilter>;

  private readonly eqWatchlistSortSubject: BehaviorSubject<EqWatchlistSort>;

  private readonly eqBlotterViewSubject: BehaviorSubject<EqBlotterView>;

  private readonly ambientStyle: BehaviorSubject<AmbientStyle>;

  private readonly chartSubstrate: BehaviorSubject<ChartSubstrate>;

  private readonly layoutEngine: BehaviorSubject<LayoutEngine>;

  private readonly jarvisSkin: BehaviorSubject<JarvisSkin>;

  private readonly jarvisBrainSubject: BehaviorSubject<JarvisBrain>;

  private readonly jarvisEffortSubject: BehaviorSubject<JarvisEffort>;

  private readonly jarvisNarratorSubject: BehaviorSubject<JarvisNarratorPreference>;

  constructor() {
    this.themeMode = new BehaviorSubject<ThemeModePreference>(
      readStored(
        THEME_STORAGE_KEY,
        isThemeModePreference,
        DEFAULT_THEME_MODE_PREFERENCE,
      ),
    );
    this.themeSkin = new BehaviorSubject<ThemeSkin>(
      readStored(THEME_SKIN_STORAGE_KEY, isThemeSkin, DEFAULT_THEME_SKIN),
    );
    this.viewMode = new BehaviorSubject<ViewMode>(
      readStored(VIEW_MODE_STORAGE_KEY, isViewMode, DEFAULT_VIEW_MODE),
    );
    this.animatedBg = new BehaviorSubject<boolean>(
      readBool(ANIMATED_BG_STORAGE_KEY, DEFAULT_ANIMATED_BACKGROUND),
    );
    this.powerSaverSubject = new BehaviorSubject<PowerSaverLevel>(
      readPowerSaverLevel(POWER_SAVER_STORAGE_KEY),
    );
    this.forceBootAnimationSubject = new BehaviorSubject<boolean>(
      readBool(FORCE_BOOT_ANIMATION_STORAGE_KEY, DEFAULT_FORCE_BOOT_ANIMATION),
    );
    this.bootVariantSubject = new BehaviorSubject<BootVariant>(
      readStored(BOOT_VARIANT_STORAGE_KEY, isBootVariant, DEFAULT_BOOT_VARIANT),
    );
    this.loginWaitVariantSubject = new BehaviorSubject<LoginWaitVariant>(
      readStored(
        LOGIN_WAIT_VARIANT_STORAGE_KEY,
        isLoginWaitVariant,
        DEFAULT_LOGIN_WAIT_VARIANT,
      ),
    );
    this.loginWaitStyleSubject = new BehaviorSubject<LoginWaitStyle>(
      readStored(
        LOGIN_WAIT_STYLE_STORAGE_KEY,
        isLoginWaitStyle,
        DEFAULT_LOGIN_WAIT_STYLE,
      ),
    );
    this.loginWaitDelaySubject = new BehaviorSubject<LoginWaitDelay>(
      readStored(
        LOGIN_WAIT_DELAY_STORAGE_KEY,
        isLoginWaitDelay,
        DEFAULT_LOGIN_WAIT_DELAY,
      ),
    );
    this.creditRfqFilterSubject = new BehaviorSubject<CreditRfqFilter>(
      readStored(
        CREDIT_RFQ_FILTER_STORAGE_KEY,
        isCreditRfqFilter,
        DEFAULT_CREDIT_RFQ_FILTER,
      ),
    );
    this.eqWatchlistSortSubject = new BehaviorSubject<EqWatchlistSort>(
      readStored(
        EQ_WATCHLIST_SORT_STORAGE_KEY,
        isEqWatchlistSort,
        DEFAULT_EQ_WATCHLIST_SORT,
      ),
    );
    this.eqBlotterViewSubject = new BehaviorSubject<EqBlotterView>(
      readStored(
        EQ_BLOTTER_VIEW_STORAGE_KEY,
        isEqBlotterView,
        DEFAULT_EQ_BLOTTER_VIEW,
      ),
    );
    this.ambientStyle = new BehaviorSubject<AmbientStyle>(
      readStored(
        AMBIENT_STYLE_STORAGE_KEY,
        isAmbientStyle,
        DEFAULT_AMBIENT_STYLE,
      ),
    );
    this.chartSubstrate = new BehaviorSubject<ChartSubstrate>(
      readStored(
        CHART_SUBSTRATE_STORAGE_KEY,
        isChartSubstrate,
        DEFAULT_CHART_SUBSTRATE,
      ),
    );
    this.layoutEngine = new BehaviorSubject<LayoutEngine>(
      readStored(
        LAYOUT_ENGINE_STORAGE_KEY,
        isLayoutEngine,
        DEFAULT_LAYOUT_ENGINE,
      ),
    );
    this.jarvisSkin = new BehaviorSubject<JarvisSkin>(
      readStored(JARVIS_SKIN_STORAGE_KEY, isJarvisSkin, DEFAULT_JARVIS_SKIN),
    );
    this.jarvisBrainSubject = new BehaviorSubject<JarvisBrain>(
      readStored(JARVIS_BRAIN_STORAGE_KEY, isJarvisBrain, DEFAULT_JARVIS_BRAIN),
    );
    this.jarvisEffortSubject = new BehaviorSubject<JarvisEffort>(
      readStored(
        JARVIS_EFFORT_STORAGE_KEY,
        isJarvisEffort,
        DEFAULT_JARVIS_EFFORT,
      ),
    );
    this.jarvisNarratorSubject = new BehaviorSubject<JarvisNarratorPreference>(
      readStored(
        JARVIS_NARRATOR_STORAGE_KEY,
        isJarvisNarratorPreference,
        DEFAULT_JARVIS_NARRATOR,
      ),
    );
  }

  themeMode$(): Observable<ThemeModePreference> {
    return this.themeMode.pipe(distinctUntilChanged());
  }

  setThemeMode(mode: ThemeModePreference): void {
    writeStored(THEME_STORAGE_KEY, mode);
    this.themeMode.next(mode);
  }

  themeSkin$(): Observable<ThemeSkin> {
    return this.themeSkin.pipe(distinctUntilChanged());
  }

  setThemeSkin(skin: ThemeSkin): void {
    writeStored(THEME_SKIN_STORAGE_KEY, skin);
    this.themeSkin.next(skin);
  }

  viewMode$(): Observable<ViewMode> {
    return this.viewMode.pipe(distinctUntilChanged());
  }

  setViewMode(viewMode: ViewMode): void {
    writeStored(VIEW_MODE_STORAGE_KEY, viewMode);
    this.viewMode.next(viewMode);
  }

  animatedBackground$(): Observable<boolean> {
    return this.animatedBg.pipe(distinctUntilChanged());
  }

  setAnimatedBackground(on: boolean): void {
    writeStored(ANIMATED_BG_STORAGE_KEY, on ? "true" : "false");
    this.animatedBg.next(on);
  }

  powerSaverLevel$(): Observable<PowerSaverLevel> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaverLevel(level: PowerSaverLevel): void {
    writeStored(POWER_SAVER_STORAGE_KEY, level);
    this.powerSaverSubject.next(level);
  }

  forceBootAnimation$(): Observable<boolean> {
    return this.forceBootAnimationSubject.pipe(distinctUntilChanged());
  }

  setForceBootAnimation(on: boolean): void {
    writeStored(FORCE_BOOT_ANIMATION_STORAGE_KEY, on ? "true" : "false");
    this.forceBootAnimationSubject.next(on);
  }

  bootVariant$(): Observable<BootVariant> {
    return this.bootVariantSubject.pipe(distinctUntilChanged());
  }

  setBootVariant(variant: BootVariant): void {
    writeStored(BOOT_VARIANT_STORAGE_KEY, variant);
    this.bootVariantSubject.next(variant);
  }

  loginWaitVariant$(): Observable<LoginWaitVariant> {
    return this.loginWaitVariantSubject.pipe(distinctUntilChanged());
  }

  setLoginWaitVariant(variant: LoginWaitVariant): void {
    writeStored(LOGIN_WAIT_VARIANT_STORAGE_KEY, variant);
    this.loginWaitVariantSubject.next(variant);
  }

  loginWaitStyle$(): Observable<LoginWaitStyle> {
    return this.loginWaitStyleSubject.pipe(distinctUntilChanged());
  }

  setLoginWaitStyle(style: LoginWaitStyle): void {
    writeStored(LOGIN_WAIT_STYLE_STORAGE_KEY, style);
    this.loginWaitStyleSubject.next(style);
  }

  loginWaitDelay$(): Observable<LoginWaitDelay> {
    return this.loginWaitDelaySubject.pipe(distinctUntilChanged());
  }

  setLoginWaitDelay(delay: LoginWaitDelay): void {
    writeStored(LOGIN_WAIT_DELAY_STORAGE_KEY, delay);
    this.loginWaitDelaySubject.next(delay);
  }

  creditRfqFilter$(): Observable<CreditRfqFilter> {
    return this.creditRfqFilterSubject.pipe(distinctUntilChanged());
  }

  setCreditRfqFilter(filter: CreditRfqFilter): void {
    writeStored(CREDIT_RFQ_FILTER_STORAGE_KEY, filter);
    this.creditRfqFilterSubject.next(filter);
  }

  eqWatchlistSort$(): Observable<EqWatchlistSort> {
    return this.eqWatchlistSortSubject.pipe(distinctUntilChanged());
  }

  setEqWatchlistSort(sort: EqWatchlistSort): void {
    writeStored(EQ_WATCHLIST_SORT_STORAGE_KEY, sort);
    this.eqWatchlistSortSubject.next(sort);
  }

  eqBlotterView$(): Observable<EqBlotterView> {
    return this.eqBlotterViewSubject.pipe(distinctUntilChanged());
  }

  setEqBlotterView(view: EqBlotterView): void {
    writeStored(EQ_BLOTTER_VIEW_STORAGE_KEY, view);
    this.eqBlotterViewSubject.next(view);
  }

  ambientStyle$(): Observable<AmbientStyle> {
    return this.ambientStyle.pipe(distinctUntilChanged());
  }

  setAmbientStyle(style: AmbientStyle): void {
    writeStored(AMBIENT_STYLE_STORAGE_KEY, style);
    this.ambientStyle.next(style);
  }

  chartSubstrate$(): Observable<ChartSubstrate> {
    return this.chartSubstrate.pipe(distinctUntilChanged());
  }

  setChartSubstrate(substrate: ChartSubstrate): void {
    writeStored(CHART_SUBSTRATE_STORAGE_KEY, substrate);
    this.chartSubstrate.next(substrate);
  }

  layoutEngine$(): Observable<LayoutEngine> {
    return this.layoutEngine.pipe(distinctUntilChanged());
  }

  setLayoutEngine(engine: LayoutEngine): void {
    writeStored(LAYOUT_ENGINE_STORAGE_KEY, engine);
    this.layoutEngine.next(engine);
  }

  jarvisSkin$(): Observable<JarvisSkin> {
    return this.jarvisSkin.pipe(distinctUntilChanged());
  }

  setJarvisSkin(skin: JarvisSkin): void {
    writeStored(JARVIS_SKIN_STORAGE_KEY, skin);
    this.jarvisSkin.next(skin);
  }

  jarvisBrain$(): Observable<JarvisBrain> {
    return this.jarvisBrainSubject.pipe(distinctUntilChanged());
  }

  setJarvisBrain(brain: JarvisBrain): void {
    writeStored(JARVIS_BRAIN_STORAGE_KEY, brain);
    this.jarvisBrainSubject.next(brain);
  }

  jarvisEffort$(): Observable<JarvisEffort> {
    return this.jarvisEffortSubject.pipe(distinctUntilChanged());
  }

  setJarvisEffort(effort: JarvisEffort): void {
    writeStored(JARVIS_EFFORT_STORAGE_KEY, effort);
    this.jarvisEffortSubject.next(effort);
  }

  jarvisNarrator$(): Observable<JarvisNarratorPreference> {
    return this.jarvisNarratorSubject.pipe(distinctUntilChanged());
  }

  setJarvisNarrator(preference: JarvisNarratorPreference): void {
    writeStored(JARVIS_NARRATOR_STORAGE_KEY, preference);
    this.jarvisNarratorSubject.next(preference);
  }
}
