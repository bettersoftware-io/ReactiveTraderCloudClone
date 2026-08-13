import type {
  AuthViewState,
  BootSequenceState,
  IncidentState,
} from "@rtc/client-core";
import {
  ConnectionStatus,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_LOGIN_WAIT_VARIANT,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type PowerSaverLevel,
  type ThemeMode,
  type ThemeSkin,
} from "@rtc/domain";

import type { ShellSlice } from "./sliceTypes";

/**
 * Builds the shell slice — the only slice exported as a BUILDER rather than a
 * plain const (see the module doc on `ShellSliceOptions` below for why).
 *
 * Every field is resolved from `options` (or its default) exactly once, into
 * a local const, before the returned object is built; each hook closes over
 * that const and returns it unchanged on every call. This is what gives
 * `toBe` identity across repeat calls within one built instance — the
 * alternative, building the returned value inside the hook body, would hand
 * back a fresh object every render and both break identity and invite a
 * later edit to compute it from something live.
 */
export function buildShellSlice(options: ShellSliceOptions = {}): ShellSlice {
  // skin/mode have no "what the host produces today" to match: unlike
  // powerSaverLevel/forceReduceMotion below, VisualScenarioHost's `skin` and
  // `mode` props are MANDATORY (VisualScenarioHost.tsx:26-27) — every
  // existing scenario passes its own value explicitly, so there is no live
  // default this bare fallback could diverge from. These fall back to the
  // domain's own DEFAULT_THEME_SKIN/DEFAULT_THEME_MODE (an unseeded
  // PreferencesSimulator's values) purely so `buildShellSlice()` is valid on
  // its own; every scenario this slice is known to serve pins its own value
  // through the option instead of relying on this fallback.
  const skin = options.skin ?? DEFAULT_THEME_SKIN;
  const mode = options.mode ?? DEFAULT_THEME_MODE;
  // Matches VisualScenarioHost's own default ("off" — both its own
  // `powerSaverLevel` prop default and the domain's DEFAULT_POWER_SAVER_LEVEL
  // agree, so there is nothing to diverge on).
  const powerSaverLevel = options.powerSaverLevel ?? DEFAULT_POWER_SAVER_LEVEL;
  // Matches VisualScenarioHost's own default: forceReduceMotion defaults
  // true, seeding PreferencesSimulator's animatedBackground to false — NOT
  // the domain's own DEFAULT_ANIMATED_BACKGROUND (true), which is the
  // production ship default rather than the visual-harness one.
  const animatedBackground = options.animatedBackground ?? false;
  // CONNECTED — matches what the live composition produces for EVERY
  // scenario today, not just this hook's own scenario: VisualScenarioHost
  // wires connectionEvents.events() to a single synchronous
  // `{ type: "gatewayConnected" }` (VisualScenarioHost.tsx:246-250), so
  // useConnectionStatus reads CONNECTED everywhere, and this hook is also
  // read by ShellHeader's pulsing dot and StatusStrip's WS·CONNECTED cell —
  // both rendered by shell/chrome, not just shell/connection-banner. A
  // DISCONNECTED default would repaint those two goldens' pixels for a
  // reason nobody chose. shell/connection-banner is the one scenario that
  // DOES want the Reconnect affordance visible (ConnectionBanner renders it
  // only when status is neither CONNECTED nor CONNECTING —
  // src/ui/ConnectionBanner.tsx); it is expected to pin a disconnected value
  // through the `connectionStatus` option below rather than rely on this
  // default (Phase D wires that per-scenario override).
  const connectionStatus =
    options.connectionStatus ?? ConnectionStatus.CONNECTED;

  const authState: AuthViewState = {
    status: "unauthenticated",
    user: null,
    locked: false,
    unlocking: false,
    error: null,
    waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
  };

  const auth = {
    state: authState,
    login: noop,
    unlock: noop,
    lock: noop,
    logout: noop,
  };

  // Hidden: the visual harness mounts BootSceneFixture/BootSequence directly
  // when it wants the splash on screen, so no scenario wants BootGate's own
  // overlay stacked on top of it (mirrors the web sibling's identical
  // reasoning in buildFakeViewModel.ts).
  const bootGate = { visible: false, reboot: noop, dismiss: noop };

  const bootSequenceState: BootSequenceState = {
    variant: "core",
    progress: 0,
    done: false,
  };
  const bootSequence = { state: bootSequenceState, skip: noop };

  const incidentState: IncidentState = { active: [] };
  const incident = { state: incidentState, inject: noop, clear: noop };

  const powerSaver = {
    level: powerSaverLevel,
    isCalm: powerSaverLevel !== "off",
    isFreeze: powerSaverLevel === "freeze",
    setLevel: noop,
    cycle: noop,
  };

  const themePreference = { mode, modePreference: mode, cycle: noop };
  const themeSkinPreference = { skin, setSkin: noop };
  const animatedBackgroundPreference = {
    enabled: animatedBackground,
    setEnabled: noop,
    toggle: noop,
  };

  const ambientStylePreference = {
    style: DEFAULT_AMBIENT_STYLE,
    setStyle: noop,
  };

  const forceBootAnimationPreference = {
    enabled: DEFAULT_FORCE_BOOT_ANIMATION,
    setEnabled: noop,
    toggle: noop,
  };

  const loginWaitPreferences = {
    style: DEFAULT_LOGIN_WAIT_STYLE,
    setStyle: noop,
    delay: DEFAULT_LOGIN_WAIT_DELAY,
    setDelay: noop,
  };
  const viewModePreference = { viewMode: DEFAULT_VIEW_MODE, setViewMode: noop };

  return {
    useAmbientStyle: () => {
      return ambientStylePreference;
    },
    useAnimatedBackground: () => {
      return animatedBackgroundPreference;
    },
    useAuth: () => {
      return auth;
    },
    useBootGate: () => {
      return bootGate;
    },
    useBootSequence: (_onDone: () => void) => {
      return bootSequence;
    },
    useConnectionStatus: () => {
      return connectionStatus;
    },
    useForceBootAnimation: () => {
      return forceBootAnimationPreference;
    },
    useIncident: () => {
      return incident;
    },
    useLoginWaitPreferences: () => {
      return loginWaitPreferences;
    },
    usePowerSaver: () => {
      return powerSaver;
    },
    useReconnect: () => {
      return noop;
    },
    useThemePreference: () => {
      return themePreference;
    },
    useThemeSkinPreference: () => {
      return themeSkinPreference;
    },
    useViewModePreference: () => {
      return viewModePreference;
    },
  };
}

/**
 * The one exception to "export a plain const" among the fake's seven slices —
 * `VisualScenarioHost` already accepts `skin` / `mode` / `forceReduceMotion` /
 * `powerSaverLevel` props today, pinning them by SEEDING a
 * `PreferencesSimulator` at composition time (see
 * `VisualScenarioHost.tsx:227-267`). When a later phase swaps that
 * composition for this fake, those props have to keep working, so the
 * theme/skin/ambient/power-saver/connection hooks this slice owns must stay
 * parameterised rather than hardcoded to one scenario's values. Every field
 * is optional and defaults to what the live composition produces TODAY, so
 * regenerating a golden off this fake moves no pixel a scenario didn't
 * deliberately choose to move (see the comment above `connectionStatus` in
 * `buildShellSlice` for the one hook this bites hardest) — `buildShellSlice()`
 * with no argument is a valid, fully-specified slice on its own.
 */
export interface ShellSliceOptions {
  readonly skin?: ThemeSkin;
  readonly mode?: ThemeMode;
  readonly powerSaverLevel?: PowerSaverLevel;
  readonly animatedBackground?: boolean;
  readonly connectionStatus?: ConnectionStatus;
}

/** Shared no-op for every intent this slice exposes. A static screenshot
 * never presses a button or fires a command, and a zero-arg void function is
 * structurally assignable to every intent signature here (callers may pass
 * arguments an implementation is free to ignore) — same convention as the
 * web sibling's `buildFakeViewModel.ts`. */
function noop(): void {}
