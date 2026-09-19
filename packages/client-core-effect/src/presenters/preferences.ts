// packages/client-core-effect/src/presenters/preferences.ts
import type {
  PowerSaverPresenter,
  ThemeSkinPreferencePresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";
import {
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type PowerSaverLevel,
  type PreferencesPort,
  type ThemeSkin,
  type ViewMode,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPort } from "#/presenters/mirrorPort";

/** Each replay-current preference stream is a `mirrorPort` of the port's
 * own stream (called once, at construction, as the RxJS presenters do). The
 * `fallback` is only ever read if the port fails to emit on subscribe — a
 * `PreferencesPort` promises it does. */

export function createThemeSkinPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ThemeSkinPreferencePresenter {
  return {
    skin$: mirrorPort(
      host,
      preferences.themeSkin$(),
      DEFAULT_THEME_SKIN,
      (s) => {
        return s;
      },
    ),
    setSkin: (skin: ThemeSkin) => {
      preferences.setThemeSkin(skin);
    },
  };
}

export function createViewModePreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ViewModePreferencePresenter {
  return {
    viewMode$: mirrorPort(
      host,
      preferences.viewMode$(),
      DEFAULT_VIEW_MODE,
      (v) => {
        return v;
      },
    ),
    setViewMode: (viewMode: ViewMode) => {
      preferences.setViewMode(viewMode);
    },
  };
}

/** Three mirrors of the same port stream, one per projection. Each warm
 * mirror is its own port subscription (the RxJS core derives `isCalm$` from
 * a shared `level$` instead) — three cheap BehaviorSubject subscriptions,
 * traded for three independent refCounts. */
export function createPowerSaverPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): PowerSaverPresenter {
  const level = preferences.powerSaverLevel$();

  return {
    level$: mirrorPort(host, level, DEFAULT_POWER_SAVER_LEVEL, (l) => {
      return l;
    }),
    isCalm$: mirrorPort(host, level, DEFAULT_POWER_SAVER_LEVEL, (l) => {
      return l !== "off";
    }),
    isFreeze$: mirrorPort(host, level, DEFAULT_POWER_SAVER_LEVEL, (l) => {
      return l === "freeze";
    }),
    setLevel: (next: PowerSaverLevel) => {
      preferences.setPowerSaverLevel(next);
    },
  };
}
