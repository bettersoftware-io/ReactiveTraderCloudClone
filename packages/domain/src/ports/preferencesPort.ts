import type { Observable } from "rxjs";

import type {
  AmbientStyle,
  BootVariant,
  CreditRfqFilter,
  EqBlotterView,
  EqWatchlistSort,
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  JarvisSkin,
  LoginWaitDelay,
  LoginWaitStyle,
  LoginWaitVariant,
  PowerSaverLevel,
  ThemeModePreference,
  ThemeSkin,
  ViewMode,
} from "../preferences/preferences.js";

/**
 * Persists user display preferences. The `*$` streams are replay-current
 * (BehaviorSubject-backed): a subscriber receives the current value
 * synchronously on subscribe. This synchronous initial emission is the
 * contract that prevents a theme flash on load.
 *
 * Theming spans two orthogonal axes — `themeMode` (light/dark) and `themeSkin`
 * (visual identity). `animatedBackground` is the perf gate for ambient motion
 * (on by default — the backdrop is compositor-only CSS; see
 * client-react/src/ui/shell/background/README.md).
 */
export interface PreferencesPort {
  /** Replay-current theme-mode preference stream; emits synchronously on
   * subscribe. The value is the stored CHOICE (dark | light | system), not the
   * resolved mode — "system" is collapsed to a concrete mode downstream via
   * `resolveThemeMode`. */
  themeMode$(): Observable<ThemeModePreference>;
  setThemeMode(mode: ThemeModePreference): void;
  /** Replay-current theme-skin stream; emits synchronously on subscribe. */
  themeSkin$(): Observable<ThemeSkin>;
  setThemeSkin(skin: ThemeSkin): void;
  /** Replay-current view-mode stream; emits synchronously on subscribe. */
  viewMode$(): Observable<ViewMode>;
  setViewMode(viewMode: ViewMode): void;
  /** Ambient-motion perf gate; default true (compositor-only CSS backdrop). */
  animatedBackground$(): Observable<boolean>;
  setAnimatedBackground(on: boolean): void;
  /** Replay-current ambient-style stream; emits synchronously on subscribe.
   * Selects Aurora (curtains) vs Rays (blobs + sweep). Orthogonal to the
   * animatedBackground motion gate. */
  ambientStyle$(): Observable<AmbientStyle>;
  setAmbientStyle(style: AmbientStyle): void;
  /** Replay-current J.A.R.V.I.S skin stream; emits synchronously on subscribe. */
  jarvisSkin$(): Observable<JarvisSkin>;
  setJarvisSkin(skin: JarvisSkin): void;
  /** Power-saver level; default "off". Ordered ladder off → calm → freeze
   * (Freeze ⊇ Calm). While not "off" the client forces the cheap rendering
   * path (still ambience, conflated price re-renders); "freeze" additionally
   * kills all decorative motion. Never mutates any other stored preference. */
  powerSaverLevel$(): Observable<PowerSaverLevel>;
  setPowerSaverLevel(level: PowerSaverLevel): void;
  /** Force the boot-splash animation to run even under
   * `prefers-reduced-motion: reduce`; default false. Boot-splash-scoped — does
   * not affect the ambient background or any other reduced-motion path. */
  forceBootAnimation$(): Observable<boolean>;
  setForceBootAnimation(on: boolean): void;
  /** Replay-current boot-sequence variant stream; emits synchronously on subscribe.
   * The cycle pointer (core → laser → docking → core …) is advanced by
   * BootSequenceMachine at each boot start via setBootVariant. */
  bootVariant$(): Observable<BootVariant>;
  setBootVariant(variant: BootVariant): void;
  /** Replay-current login-wait variant stream; emits synchronously on subscribe.
   * The cycle pointer (handshake → reactor → handshake …) is advanced by
   * AuthPresenter at each login/unlock attempt start via setLoginWaitVariant. */
  loginWaitVariant$(): Observable<LoginWaitVariant>;
  setLoginWaitVariant(variant: LoginWaitVariant): void;
  /** Replay-current login-wait STYLE stream — the user's choice, as opposed to
   * `loginWaitVariant$`'s cycle position. `"auto"` defers to that cycle; a
   * concrete value pins one treatment and leaves the pointer untouched. */
  loginWaitStyle$(): Observable<LoginWaitStyle>;
  setLoginWaitStyle(style: LoginWaitStyle): void;
  /** Replay-current artificial login-delay stream; default `"off"`. Applied by
   * a decorator around the AuthPort at composition, so it covers unlock as
   * well as login and is independent of which AuthPort implementation (real WS
   * or simulator) is in play. */
  loginWaitDelay$(): Observable<LoginWaitDelay>;
  setLoginWaitDelay(delay: LoginWaitDelay): void;
  /** Replay-current Credit RFQs filter stream; emits synchronously on subscribe.
   * Shared between the RFQs panel (reader) and its head's filter pills (writer). */
  creditRfqFilter$(): Observable<CreditRfqFilter>;
  setCreditRfqFilter(filter: CreditRfqFilter): void;
  /** Replay-current equities watchlist sort-mode stream; emits synchronously
   * on subscribe. Driven by the Watchlist head's ⇅ cycle control. */
  eqWatchlistSort$(): Observable<EqWatchlistSort>;
  setEqWatchlistSort(sort: EqWatchlistSort): void;
  /** Replay-current equities blotter tab stream; emits synchronously on
   * subscribe. Consumed by the Orders/Positions blotter (Task 5). */
  eqBlotterView$(): Observable<EqBlotterView>;
  setEqBlotterView(view: EqBlotterView): void;
  /** Replay-current Jarvis brain stream; emits synchronously on subscribe.
   * Selects which AI powers the desk assistant — `"scripted"` is the
   * built-in scripted brain; the `claude-*` entries select a live Claude
   * model via the server's Anthropic-backed agent loop. */
  jarvisBrain$(): Observable<JarvisBrain>;
  setJarvisBrain(brain: JarvisBrain): void;
  /** Replay-current Jarvis effort stream; emits synchronously on subscribe.
   * The thinking-effort budget passed to a live Claude brain; ignored by the
   * `"scripted"` brain. */
  jarvisEffort$(): Observable<JarvisEffort>;
  setJarvisEffort(effort: JarvisEffort): void;
  /** Replay-current Jarvis narrator stream; emits synchronously on
   * subscribe. Whether the app-driving proactive narrator (`NarratorMachine`)
   * may dispatch unsolicited `narrate()` turns; `"off"` fully silences it. */
  jarvisNarrator$(): Observable<JarvisNarratorPreference>;
  setJarvisNarrator(preference: JarvisNarratorPreference): void;
}
