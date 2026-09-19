// packages/client-core-effect/src/presenters/preferences.ts
import type {
  AmbientStylePresenter,
  AnimatedBackgroundPresenter,
  ChartSubstratePresenter,
  CreditRfqFilterPreferencePresenter,
  EqBlotterViewPreferencePresenter,
  ForceBootAnimationPresenter,
  LayoutEnginePresenter,
  PowerSaverPresenter,
  ThemeSkinPreferencePresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";
import {
  type AmbientStyle,
  type ChartSubstrate,
  type CreditRfqFilter,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_ANIMATED_BACKGROUND,
  DEFAULT_CHART_SUBSTRATE,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_LAYOUT_ENGINE,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type EqBlotterView,
  type LayoutEngine,
  type PowerSaverLevel,
  type PreferencesPort,
  type ThemeSkin,
  type ViewMode,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPort, mirrorPortAsIs } from "#/presenters/mirrorPort";

/** Each replay-current preference stream is a `mirrorPort` of the port's
 * own stream (called once, at construction, as the RxJS presenters do). The
 * `fallback` is only ever read if the port fails to emit on subscribe — a
 * `PreferencesPort` promises it does. */

export function createThemeSkinPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ThemeSkinPreferencePresenter {
  return {
    skin$: mirrorPortAsIs(host, preferences.themeSkin$(), DEFAULT_THEME_SKIN),
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
    viewMode$: mirrorPortAsIs(host, preferences.viewMode$(), DEFAULT_VIEW_MODE),
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
    level$: mirrorPortAsIs(host, level, DEFAULT_POWER_SAVER_LEVEL),
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

export function createCreditRfqFilterPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): CreditRfqFilterPreferencePresenter {
  return {
    filter$: mirrorPortAsIs(
      host,
      preferences.creditRfqFilter$(),
      DEFAULT_CREDIT_RFQ_FILTER,
    ),
    setFilter: (filter: CreditRfqFilter) => {
      preferences.setCreditRfqFilter(filter);
    },
  };
}

export function createEqBlotterViewPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): EqBlotterViewPreferencePresenter {
  return {
    view$: mirrorPortAsIs(
      host,
      preferences.eqBlotterView$(),
      DEFAULT_EQ_BLOTTER_VIEW,
    ),
    setView: (view: EqBlotterView) => {
      preferences.setEqBlotterView(view);
    },
  };
}

export function createAmbientStylePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): AmbientStylePresenter {
  return {
    style$: mirrorPortAsIs(
      host,
      preferences.ambientStyle$(),
      DEFAULT_AMBIENT_STYLE,
    ),
    setStyle: (style: AmbientStyle) => {
      preferences.setAmbientStyle(style);
    },
  };
}

export function createChartSubstratePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ChartSubstratePresenter {
  return {
    substrate$: mirrorPortAsIs(
      host,
      preferences.chartSubstrate$(),
      DEFAULT_CHART_SUBSTRATE,
    ),
    setSubstrate: (substrate: ChartSubstrate) => {
      preferences.setChartSubstrate(substrate);
    },
  };
}

export function createLayoutEnginePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): LayoutEnginePresenter {
  return {
    engine$: mirrorPortAsIs(
      host,
      preferences.layoutEngine$(),
      DEFAULT_LAYOUT_ENGINE,
    ),
    setEngine: (engine: LayoutEngine) => {
      preferences.setLayoutEngine(engine);
    },
  };
}

/** The two boolean gates. `toggle(current)` flips the SUPPLIED value and
 * reads nothing — the caller's rendered state is the truth it flips, and a
 * store-reading toggle would diverge from it exactly when the two disagree
 * (the contract's `toggle(current)` case pins the difference). */

export function createAnimatedBackgroundPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): AnimatedBackgroundPresenter {
  return {
    enabled$: mirrorPortAsIs(
      host,
      preferences.animatedBackground$(),
      DEFAULT_ANIMATED_BACKGROUND,
    ),
    set: (on: boolean) => {
      preferences.setAnimatedBackground(on);
    },
    toggle: (current: boolean) => {
      preferences.setAnimatedBackground(!current);
    },
  };
}

export function createForceBootAnimationPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ForceBootAnimationPresenter {
  return {
    enabled$: mirrorPortAsIs(
      host,
      preferences.forceBootAnimation$(),
      DEFAULT_FORCE_BOOT_ANIMATION,
    ),
    set: (on: boolean) => {
      preferences.setForceBootAnimation(on);
    },
    toggle: (current: boolean) => {
      preferences.setForceBootAnimation(!current);
    },
  };
}
