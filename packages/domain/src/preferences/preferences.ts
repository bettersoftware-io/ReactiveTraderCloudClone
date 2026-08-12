/**
 * User-facing display preferences. These are pure value types — the UI's
 * theme tokens (shell/theme) and `ViewMode` (fx/liveRates/ViewToggle) unions
 * mirror these exactly. Defaults match today's synchronous-read defaults so
 * the localStorage adapter is transparent to existing users.
 *
 * Theming has two orthogonal axes: a `ThemeSkin` (visual identity) and a
 * `ThemeMode` (light/dark recolouring).
 */

export type ThemeMode = "dark" | "light";
/**
 * The user's stored theme-mode choice. `"system"` defers the concrete mode to
 * the OS (`prefers-color-scheme`); `resolveThemeMode` collapses it to a paintable
 * `ThemeMode`. The two concrete values coincide with `ThemeMode`, so the painted
 * tokens / `dataset.mode` stay `dark | light` regardless of the preference.
 */
export type ThemeModePreference = ThemeMode | "system";
export type ThemeSkin =
  | "classic"
  | "holo"
  | "holo3d"
  | "terminal"
  | "terminal3d"
  | "neon";
export type ViewMode = "chart" | "price";

/** The Credit RFQs panel's LIVE/CLOSED/ALL filter, shared between the panel
 * (reader) and its head's filter pills (writer) via the same
 * useCreditRfqFilterPreference seam as ViewMode. Mirrors the prototype's
 * CreditTab union (dc.html `creditTab` state). */
export type CreditRfqFilter = "live" | "closed" | "all";

/** The boot sequence visual variant. Cycles across sessions — each run advances
 * to the next entry in the fixed order (core → laser → docking → hologram →
 * geo → layers → jarvis → topo → core …). Persisted under the
 * `rt-boot-variant` key (web `localStorage`, RN AsyncStorage — the same
 * constant on both); the last five are the v3 3D scenes. */
export type BootVariant =
  | "core"
  | "laser"
  | "docking"
  | "hologram"
  | "geo"
  | "layers"
  | "jarvis"
  | "topo";

/** The login/unlock waiting-state visual variant. Cycles across attempts —
 * each attempt advances to the next entry (handshake → reactor → handshake …).
 * Persisted under the `rt-login-wait-variant` key (web `localStorage`, RN
 * AsyncStorage — the same constant on both). */
export type LoginWaitVariant = "handshake" | "reactor";

/** Which login-wait treatment to render, as a user CHOICE rather than a cycle
 * position. `"auto"` defers to the persisted `LoginWaitVariant` cycle (the
 * shipping behaviour); the two concrete values pin one treatment and leave the
 * cycle pointer untouched, so switching back to `"auto"` resumes where it was.
 *
 * Exists because the wait treatments are timer-free by design — they mount on
 * dispatch and unmount on outcome — so against a fast backend neither one is
 * observable long enough to inspect, and which of the two you get is decided
 * by a pointer you cannot see. Pairs with `LoginWaitDelay`. */
export type LoginWaitStyle = "auto" | LoginWaitVariant;

/** An artificial delay applied to login/unlock outcomes so the wait treatment
 * is observable. Values are self-describing rather than opaque tiers, because
 * the point of the setting is to choose a duration you can watch against.
 * Default `"off"` — this changes no shipping behaviour unless asked for. */
export type LoginWaitDelay = "off" | "1s" | "3s" | "6s";

/** The equities Watchlist's sort mode — symbol (A–Z), % change, or last price.
 * Driven by the watchlist head's ⇅ cycle control. */
export type EqWatchlistSort = "sym" | "chg" | "price";

/** The equities Blotter panel's active tab — Orders or Positions. */
export type EqBlotterView = "orders" | "positions";

/** The ambient backdrop style. `aurora` is the v5 default — fixed-palette
 * northern-lights curtains; `rays` is the original accent-tinted blobs +
 * rotating conic sweep. Orthogonal to `animatedBackground` (the motion gate)
 * and to the per-skin `--aurora-opacity` master opacity, which gates whichever
 * style is active. */
export type AmbientStyle = "aurora" | "rays";

/** The chart rendering substrate. `"dom"` is retained DOM/SVG geometry (today's
 * shipping renderer); `"canvas"` is immediate-mode canvas drawing, which keeps
 * fewer live DOM nodes on screen. Orthogonal to every other display
 * preference. */
export type ChartSubstrate = "dom" | "canvas";

/**
 * `workspaceLayoutV1` (declared directly on `PreferencesPort` as a bare
 * `string | null`, not as a named alias here) is the first OPTIONAL
 * preference in this module — an opaque, unvalidated serialized layout
 * payload a later task defines the shape of. `null` is not a stand-in for
 * "no default chosen yet" the way it would be nowhere else in this file: it
 * IS the default, and "no layout saved" is a fully first-class state.
 * Deliberately no roster array and no `DEFAULT_*` constant exported for it —
 * validating the payload beyond "is this a string" is the job of whichever
 * later task parses it, not this layer. Persisted under
 * `rtc-workspace-layout-v1` (web `localStorage`, RN AsyncStorage — the same
 * key on both).
 */

/** The workspace layout engine. `"inhouse"` is the shipping split-tree
 * engine; `"dockview"` is the Dockview docking engine (drag tabs to
 * re-arrange, layout persisted per workspace tab). Orthogonal to every
 * other display preference. */
export type LayoutEngine = "inhouse" | "dockview";

/** J.A.R.V.I.S orb/overlay visual core. Rendered in order by the skin switch. */
export type JarvisSkin = "singularity" | "reactor";

/** Boot-variant cycle order (PROTO _startBoot `variants` list, v3). */
export const BOOT_VARIANTS: readonly BootVariant[] = [
  "core",
  "laser",
  "docking",
  "hologram",
  "geo",
  "layers",
  "jarvis",
  "topo",
];

/** Login-wait variant cycle order. Advanced on attempt start by AuthPresenter. */
export const LOGIN_WAIT_VARIANTS: readonly LoginWaitVariant[] = [
  "handshake",
  "reactor",
];

/** Selectable login-wait styles, in segment order. */
export const LOGIN_WAIT_STYLES: readonly LoginWaitStyle[] = [
  "auto",
  ...LOGIN_WAIT_VARIANTS,
];

/** Selectable login-wait delays, in segment order. */
export const LOGIN_WAIT_DELAYS: readonly LoginWaitDelay[] = [
  "off",
  "1s",
  "3s",
  "6s",
];

/**
 * Milliseconds per delay choice. The non-zero values are sized against the
 * treatments themselves, not picked round: the handshake's staged reveal
 * settles at 0.85s and the reactor's slowest counter-rotation takes 2.3s per
 * turn, so 1s catches the handshake once, 3s clears a full reactor turn, and
 * 6s is unhurried inspection.
 */
export const LOGIN_WAIT_DELAY_MS: Readonly<Record<LoginWaitDelay, number>> = {
  off: 0,
  "1s": 1_000,
  "3s": 3_000,
  "6s": 6_000,
};

export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const DEFAULT_THEME_SKIN: ThemeSkin = "holo"; // showcase default; "classic" preserves the pre-redesign look
export const DEFAULT_VIEW_MODE: ViewMode = "chart";
/** Ambient animated-background perf gate default. ON: the backdrop is entirely
 * compositor-only CSS (transform/opacity, blur removed — see
 * client-react/src/ui/shell/background/README.md), so the drift is effectively
 * free on the main thread and ships enabled. Users who turn it off keep that
 * choice (persisted under `rtc-animated-bg`); OS `prefers-reduced-motion` still
 * overrides it to static regardless. */
export const DEFAULT_ANIMATED_BACKGROUND = true;
/** Ambient backdrop style default. Matches the v5 design (northern-lights
 * curtains). Users who pick "rays" keep that choice (persisted under
 * `rtc-ambient-style`). */
export const DEFAULT_AMBIENT_STYLE: AmbientStyle = "aurora";
/** Chart rendering substrate default. Users who pick "canvas" keep that choice
 * (persisted under `rtc-chart-substrate`). */
export const DEFAULT_CHART_SUBSTRATE: ChartSubstrate = "dom";
/** Workspace layout-engine default. Users who pick "dockview" keep that
 * choice (persisted under `rtc-layout-engine`). */
export const DEFAULT_LAYOUT_ENGINE: LayoutEngine = "inhouse";
/** J.A.R.V.I.S visual core default. Users who pick "reactor" keep that choice
 * (persisted under `rtc-jarvis-skin`). */
export const DEFAULT_JARVIS_SKIN: JarvisSkin = "singularity";
/** Force the boot-splash animation to play even under prefers-reduced-motion.
 * Default true — showcase posture: the boot splash is part of the product
 * identity, so it plays unless the user opts out via this preference.
 * Reduced-motion users regain suppression by turning the toggle off; power-
 * saver Freeze still unconditionally skips the boot canvas regardless of this
 * value, and the webdriver/?nosplash automation gate is a separate layer. */
export const DEFAULT_FORCE_BOOT_ANIMATION = true;
export const DEFAULT_CREDIT_RFQ_FILTER: CreditRfqFilter = "live";
export const DEFAULT_BOOT_VARIANT: BootVariant = "core";
export const DEFAULT_LOGIN_WAIT_VARIANT: LoginWaitVariant = "handshake";
/** Defer to the cycle — i.e. today's shipping behaviour, unchanged. */
export const DEFAULT_LOGIN_WAIT_STYLE: LoginWaitStyle = "auto";
/** No artificial delay: a stored preference must not slow anyone's sign-in
 * until they ask it to. */
export const DEFAULT_LOGIN_WAIT_DELAY: LoginWaitDelay = "off";
export const DEFAULT_EQ_WATCHLIST_SORT: EqWatchlistSort = "chg";
export const DEFAULT_EQ_BLOTTER_VIEW: EqBlotterView = "orders";

/** The watchlist head's ⇅ button cycles through these in order. */
export const EQ_WATCHLIST_SORTS: readonly EqWatchlistSort[] = [
  "sym",
  "chg",
  "price",
];

export const THEME_SKINS: readonly ThemeSkin[] = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
  "neon",
];
export const THEME_MODES: readonly ThemeMode[] = ["dark", "light"];

/** The Preferences "Ambient style" segmented control renders these in order. */
export const AMBIENT_STYLES: readonly AmbientStyle[] = ["aurora", "rays"];

/** The Preferences "Chart renderer" segmented control renders these in order. */
export const CHART_SUBSTRATES: readonly ChartSubstrate[] = ["dom", "canvas"];

/** The Preferences "Layout engine" segmented control renders these in order. */
export const LAYOUT_ENGINES: readonly LayoutEngine[] = ["inhouse", "dockview"];

/** The J.A.R.V.I.S skin switch renders these in order. */
export const JARVIS_SKINS: readonly JarvisSkin[] = ["singularity", "reactor"];

/** Default stored mode preference. Equal in value to DEFAULT_THEME_MODE, so
 * existing users (who have a concrete "dark"/"light" persisted) and the visual
 * goldens are unaffected — "system" is strictly opt-in via the header toggle. */
export const DEFAULT_THEME_MODE_PREFERENCE: ThemeModePreference = "dark";

/** The header toggle cycles through these in order: dark → light → system → … */
export const THEME_MODE_PREFERENCES: readonly ThemeModePreference[] = [
  "dark",
  "light",
  "system",
];

/** The next preference in the toggle cycle (wraps around). */
export function nextThemeModePreference(
  current: ThemeModePreference,
): ThemeModePreference {
  const i = THEME_MODE_PREFERENCES.indexOf(current);
  return (
    THEME_MODE_PREFERENCES[(i + 1) % THEME_MODE_PREFERENCES.length] ?? "dark"
  );
}

/** Collapse a stored preference to the concrete mode that actually paints:
 * "system" follows the OS via `prefersDark`; concrete choices pass through. */
export function resolveThemeMode(
  pref: ThemeModePreference,
  prefersDark: boolean,
): ThemeMode {
  if (pref === "system") {
    return prefersDark ? "dark" : "light";
  }

  return pref;
}

/** The next sort in the watchlist head's ⇅ cycle (wraps around): sym → chg → price → sym. */
export function nextEqWatchlistSort(current: EqWatchlistSort): EqWatchlistSort {
  const i = EQ_WATCHLIST_SORTS.indexOf(current);
  return (
    EQ_WATCHLIST_SORTS[(i + 1) % EQ_WATCHLIST_SORTS.length] ??
    DEFAULT_EQ_WATCHLIST_SORT
  );
}

/** Power-saver level. Ordered ladder Off → Calm → Freeze; Freeze ⊇ Calm.
 *  - off:    full "wow-effect" experience.
 *  - calm:   ambient backdrop removed, decorative loops paused, prices conflated.
 *  - freeze: everything Calm does PLUS all remaining motion killed (tick-flash,
 *            FLIP/rank-glide, transitions, spinners) for GPU-less Citrix/VDI boxes. */
export type PowerSaverLevel = "off" | "calm" | "freeze";

export const DEFAULT_POWER_SAVER_LEVEL: PowerSaverLevel = "off";

/** The header ⌁ button cycles through these in order: off → calm → freeze → off. */
export const POWER_SAVER_LEVELS: readonly PowerSaverLevel[] = [
  "off",
  "calm",
  "freeze",
];

/** The next level in the header cycle (wraps around). */
export function nextPowerSaverLevel(current: PowerSaverLevel): PowerSaverLevel {
  const i = POWER_SAVER_LEVELS.indexOf(current);
  return (
    POWER_SAVER_LEVELS[(i + 1) % POWER_SAVER_LEVELS.length] ??
    DEFAULT_POWER_SAVER_LEVEL
  );
}

/** Storage/type guard — a valid stored level string. Legacy boolean migration
 *  (`"true"` → `"calm"`) is handled by each adapter, not here. */
export function isPowerSaverLevel(
  value: string | null,
): value is PowerSaverLevel {
  return value === "off" || value === "calm" || value === "freeze";
}

/** Which AI brain powers the Jarvis desk assistant. `"scripted"` is the
 * transport-neutral scripted brain (`@rtc/shared`'s `ScriptedAgentLoop`,
 * timer-driven canned responses, no network call); the `claude-*` entries
 * select a live Claude model via the server's Anthropic-backed agent loop. */
export type JarvisBrain =
  | "scripted"
  | "claude-haiku-4-5"
  | "claude-sonnet-5"
  | "claude-opus-5";

/** Selectable Jarvis brains, in picker order (cheapest/offline first). */
export const JARVIS_BRAINS: readonly JarvisBrain[] = [
  "scripted",
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
];

export const DEFAULT_JARVIS_BRAIN: JarvisBrain = "claude-haiku-4-5";

/** Storage/type guard — a valid stored brain string. */
export function isJarvisBrain(value: unknown): value is JarvisBrain {
  return (JARVIS_BRAINS as readonly unknown[]).includes(value);
}

/** The thinking-effort budget passed to a live Claude brain (Anthropic's
 * `effort` request parameter). Ignored by the `"scripted"` brain, which has
 * no notion of effort. */
export type JarvisEffort = "low" | "medium" | "high";

/** Selectable Jarvis effort levels, in picker order. */
export const JARVIS_EFFORTS: readonly JarvisEffort[] = [
  "low",
  "medium",
  "high",
];

export const DEFAULT_JARVIS_EFFORT: JarvisEffort = "medium";

/** Storage/type guard — a valid stored effort string. */
export function isJarvisEffort(value: unknown): value is JarvisEffort {
  return (JARVIS_EFFORTS as readonly unknown[]).includes(value);
}

/** UI/footer display names — the wire and storage always use the id. */
export const JARVIS_BRAIN_LABELS: Record<JarvisBrain, string> = {
  scripted: "scripted",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-opus-5": "Opus 5",
};

/** Whether the app-driving proactive narrator (`NarratorMachine`) is allowed
 * to dispatch unsolicited `narrate()` turns into the Jarvis transcript.
 * `"on"` is the default — the narrator's whole point is surfacing an
 * anomaly the user wasn't looking for, so shipping it opt-in would silence
 * the feature for everyone who never finds the toggle; `"off"` fully
 * silences it without touching any other Jarvis preference (brain/effort/
 * skin all stay independent). */
export type JarvisNarratorPreference = "on" | "off";

/** Selectable narrator states, in toggle order. */
export const JARVIS_NARRATOR_PREFERENCES: readonly JarvisNarratorPreference[] =
  ["on", "off"];

export const DEFAULT_JARVIS_NARRATOR: JarvisNarratorPreference = "on";

/** Storage/type guard — a valid stored narrator-preference string. */
export function isJarvisNarratorPreference(
  value: unknown,
): value is JarvisNarratorPreference {
  return (JARVIS_NARRATOR_PREFERENCES as readonly unknown[]).includes(value);
}
