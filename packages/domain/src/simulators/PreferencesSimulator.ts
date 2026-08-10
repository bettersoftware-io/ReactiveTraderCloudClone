import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import type { PreferencesPort } from "../ports/preferencesPort.js";
import {
  type AmbientStyle,
  type BootVariant,
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
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_LOGIN_WAIT_VARIANT,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type EqBlotterView,
  type EqWatchlistSort,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisNarratorPreference,
  type JarvisSkin,
  type LoginWaitDelay,
  type LoginWaitStyle,
  type LoginWaitVariant,
  type PowerSaverLevel,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "../preferences/preferences.js";

export interface PreferencesSeed {
  themeMode?: ThemeModePreference;
  themeSkin?: ThemeSkin;
  viewMode?: ViewMode;
  animatedBackground?: boolean;
  ambientStyle?: AmbientStyle;
  chartSubstrate?: ChartSubstrate;
  powerSaverLevel?: PowerSaverLevel;
  forceBootAnimation?: boolean;
  bootVariant?: BootVariant;
  loginWaitVariant?: LoginWaitVariant;
  loginWaitStyle?: LoginWaitStyle;
  loginWaitDelay?: LoginWaitDelay;
  creditRfqFilter?: CreditRfqFilter;
  eqWatchlistSort?: EqWatchlistSort;
  eqBlotterView?: EqBlotterView;
  jarvisSkin?: JarvisSkin;
  jarvisBrain?: JarvisBrain;
  jarvisEffort?: JarvisEffort;
  jarvisNarrator?: JarvisNarratorPreference;
}

/**
 * In-memory PreferencesPort backed by BehaviorSubjects, so each stream replays
 * the current value synchronously on subscribe. For domain tests and fakes only;
 * real browser persistence uses the localStorage adapter in the client package.
 */
export class PreferencesSimulator implements PreferencesPort {
  private readonly themeMode: BehaviorSubject<ThemeModePreference>;

  private readonly themeSkin: BehaviorSubject<ThemeSkin>;

  private readonly viewMode: BehaviorSubject<ViewMode>;

  private readonly animatedBg: BehaviorSubject<boolean>;

  private readonly ambientStyleSubject: BehaviorSubject<AmbientStyle>;

  private readonly chartSubstrateSubject: BehaviorSubject<ChartSubstrate>;

  private readonly jarvisSkinSubject: BehaviorSubject<JarvisSkin>;

  private readonly powerSaverSubject: BehaviorSubject<PowerSaverLevel>;

  private readonly forceBootAnimationSubject: BehaviorSubject<boolean>;

  private readonly bootVariantSubject: BehaviorSubject<BootVariant>;

  private readonly loginWaitVariantSubject: BehaviorSubject<LoginWaitVariant>;

  private readonly loginWaitStyleSubject: BehaviorSubject<LoginWaitStyle>;

  private readonly loginWaitDelaySubject: BehaviorSubject<LoginWaitDelay>;

  private readonly creditRfqFilterSubject: BehaviorSubject<CreditRfqFilter>;

  private readonly eqWatchlistSortSubject: BehaviorSubject<EqWatchlistSort>;

  private readonly eqBlotterViewSubject: BehaviorSubject<EqBlotterView>;

  private readonly jarvisBrainSubject: BehaviorSubject<JarvisBrain>;

  private readonly jarvisEffortSubject: BehaviorSubject<JarvisEffort>;

  private readonly jarvisNarratorSubject: BehaviorSubject<JarvisNarratorPreference>;

  constructor(seed: PreferencesSeed = {}) {
    this.themeMode = new BehaviorSubject<ThemeModePreference>(
      seed.themeMode ?? DEFAULT_THEME_MODE_PREFERENCE,
    );
    this.themeSkin = new BehaviorSubject<ThemeSkin>(
      seed.themeSkin ?? DEFAULT_THEME_SKIN,
    );
    this.viewMode = new BehaviorSubject<ViewMode>(
      seed.viewMode ?? DEFAULT_VIEW_MODE,
    );
    this.animatedBg = new BehaviorSubject<boolean>(
      seed.animatedBackground ?? DEFAULT_ANIMATED_BACKGROUND,
    );
    this.ambientStyleSubject = new BehaviorSubject<AmbientStyle>(
      seed.ambientStyle ?? DEFAULT_AMBIENT_STYLE,
    );
    this.chartSubstrateSubject = new BehaviorSubject<ChartSubstrate>(
      seed.chartSubstrate ?? DEFAULT_CHART_SUBSTRATE,
    );
    this.jarvisSkinSubject = new BehaviorSubject<JarvisSkin>(
      seed.jarvisSkin ?? DEFAULT_JARVIS_SKIN,
    );
    this.powerSaverSubject = new BehaviorSubject<PowerSaverLevel>(
      seed.powerSaverLevel ?? DEFAULT_POWER_SAVER_LEVEL,
    );
    this.forceBootAnimationSubject = new BehaviorSubject<boolean>(
      seed.forceBootAnimation ?? DEFAULT_FORCE_BOOT_ANIMATION,
    );
    this.bootVariantSubject = new BehaviorSubject<BootVariant>(
      seed.bootVariant ?? DEFAULT_BOOT_VARIANT,
    );
    this.loginWaitVariantSubject = new BehaviorSubject<LoginWaitVariant>(
      seed.loginWaitVariant ?? DEFAULT_LOGIN_WAIT_VARIANT,
    );
    this.loginWaitStyleSubject = new BehaviorSubject<LoginWaitStyle>(
      seed.loginWaitStyle ?? DEFAULT_LOGIN_WAIT_STYLE,
    );
    this.loginWaitDelaySubject = new BehaviorSubject<LoginWaitDelay>(
      seed.loginWaitDelay ?? DEFAULT_LOGIN_WAIT_DELAY,
    );
    this.creditRfqFilterSubject = new BehaviorSubject<CreditRfqFilter>(
      seed.creditRfqFilter ?? DEFAULT_CREDIT_RFQ_FILTER,
    );
    this.eqWatchlistSortSubject = new BehaviorSubject<EqWatchlistSort>(
      seed.eqWatchlistSort ?? DEFAULT_EQ_WATCHLIST_SORT,
    );
    this.eqBlotterViewSubject = new BehaviorSubject<EqBlotterView>(
      seed.eqBlotterView ?? DEFAULT_EQ_BLOTTER_VIEW,
    );
    this.jarvisBrainSubject = new BehaviorSubject<JarvisBrain>(
      seed.jarvisBrain ?? DEFAULT_JARVIS_BRAIN,
    );
    this.jarvisEffortSubject = new BehaviorSubject<JarvisEffort>(
      seed.jarvisEffort ?? DEFAULT_JARVIS_EFFORT,
    );
    this.jarvisNarratorSubject = new BehaviorSubject<JarvisNarratorPreference>(
      seed.jarvisNarrator ?? DEFAULT_JARVIS_NARRATOR,
    );
  }

  themeMode$(): Observable<ThemeModePreference> {
    return this.themeMode.pipe(distinctUntilChanged());
  }

  setThemeMode(mode: ThemeModePreference): void {
    this.themeMode.next(mode);
  }

  themeSkin$(): Observable<ThemeSkin> {
    return this.themeSkin.pipe(distinctUntilChanged());
  }

  setThemeSkin(skin: ThemeSkin): void {
    this.themeSkin.next(skin);
  }

  viewMode$(): Observable<ViewMode> {
    return this.viewMode.pipe(distinctUntilChanged());
  }

  setViewMode(viewMode: ViewMode): void {
    this.viewMode.next(viewMode);
  }

  animatedBackground$(): Observable<boolean> {
    return this.animatedBg.pipe(distinctUntilChanged());
  }

  setAnimatedBackground(on: boolean): void {
    this.animatedBg.next(on);
  }

  ambientStyle$(): Observable<AmbientStyle> {
    return this.ambientStyleSubject.pipe(distinctUntilChanged());
  }

  setAmbientStyle(style: AmbientStyle): void {
    this.ambientStyleSubject.next(style);
  }

  chartSubstrate$(): Observable<ChartSubstrate> {
    return this.chartSubstrateSubject.pipe(distinctUntilChanged());
  }

  setChartSubstrate(substrate: ChartSubstrate): void {
    this.chartSubstrateSubject.next(substrate);
  }

  jarvisSkin$(): Observable<JarvisSkin> {
    return this.jarvisSkinSubject.pipe(distinctUntilChanged());
  }

  setJarvisSkin(skin: JarvisSkin): void {
    this.jarvisSkinSubject.next(skin);
  }

  powerSaverLevel$(): Observable<PowerSaverLevel> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaverLevel(level: PowerSaverLevel): void {
    this.powerSaverSubject.next(level);
  }

  forceBootAnimation$(): Observable<boolean> {
    return this.forceBootAnimationSubject.pipe(distinctUntilChanged());
  }

  setForceBootAnimation(on: boolean): void {
    this.forceBootAnimationSubject.next(on);
  }

  bootVariant$(): Observable<BootVariant> {
    return this.bootVariantSubject.pipe(distinctUntilChanged());
  }

  setBootVariant(variant: BootVariant): void {
    this.bootVariantSubject.next(variant);
  }

  loginWaitVariant$(): Observable<LoginWaitVariant> {
    return this.loginWaitVariantSubject.pipe(distinctUntilChanged());
  }

  setLoginWaitVariant(variant: LoginWaitVariant): void {
    this.loginWaitVariantSubject.next(variant);
  }

  loginWaitStyle$(): Observable<LoginWaitStyle> {
    return this.loginWaitStyleSubject.pipe(distinctUntilChanged());
  }

  setLoginWaitStyle(style: LoginWaitStyle): void {
    this.loginWaitStyleSubject.next(style);
  }

  loginWaitDelay$(): Observable<LoginWaitDelay> {
    return this.loginWaitDelaySubject.pipe(distinctUntilChanged());
  }

  setLoginWaitDelay(delay: LoginWaitDelay): void {
    this.loginWaitDelaySubject.next(delay);
  }

  creditRfqFilter$(): Observable<CreditRfqFilter> {
    return this.creditRfqFilterSubject.pipe(distinctUntilChanged());
  }

  setCreditRfqFilter(filter: CreditRfqFilter): void {
    this.creditRfqFilterSubject.next(filter);
  }

  eqWatchlistSort$(): Observable<EqWatchlistSort> {
    return this.eqWatchlistSortSubject.pipe(distinctUntilChanged());
  }

  setEqWatchlistSort(sort: EqWatchlistSort): void {
    this.eqWatchlistSortSubject.next(sort);
  }

  eqBlotterView$(): Observable<EqBlotterView> {
    return this.eqBlotterViewSubject.pipe(distinctUntilChanged());
  }

  setEqBlotterView(view: EqBlotterView): void {
    this.eqBlotterViewSubject.next(view);
  }

  jarvisBrain$(): Observable<JarvisBrain> {
    return this.jarvisBrainSubject.pipe(distinctUntilChanged());
  }

  setJarvisBrain(brain: JarvisBrain): void {
    this.jarvisBrainSubject.next(brain);
  }

  jarvisEffort$(): Observable<JarvisEffort> {
    return this.jarvisEffortSubject.pipe(distinctUntilChanged());
  }

  setJarvisEffort(effort: JarvisEffort): void {
    this.jarvisEffortSubject.next(effort);
  }

  jarvisNarrator$(): Observable<JarvisNarratorPreference> {
    return this.jarvisNarratorSubject.pipe(distinctUntilChanged());
  }

  setJarvisNarrator(preference: JarvisNarratorPreference): void {
    this.jarvisNarratorSubject.next(preference);
  }
}
