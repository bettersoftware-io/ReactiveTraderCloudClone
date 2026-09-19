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
import type {
  AmbientStyle,
  ChartSubstrate,
  CreditRfqFilter,
  EqBlotterView,
  LayoutEngine,
  PowerSaverLevel,
  PreferencesPort,
  ThemeSkin,
  ViewMode,
} from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { mapTopic } from "#/kernel/topic";

/** Each replay-current preference stream is the port's own stream as a
 * Topic (`topicFromObservable`): subscribed on the first consumer, released
 * on the last, current value replayed synchronously — the RxJS core's
 * `shareReplay({ bufferSize: 1, refCount: true })` per member. The port is
 * called once, at construction, as the RxJS presenters do. */

export function createThemeSkinPreferencePresenter(
  preferences: PreferencesPort,
): ThemeSkinPreferencePresenter {
  return {
    skin$: topicToStream(topicFromObservable(preferences.themeSkin$())),
    setSkin: (skin: ThemeSkin) => {
      preferences.setThemeSkin(skin);
    },
  };
}

export function createViewModePreferencePresenter(
  preferences: PreferencesPort,
): ViewModePreferencePresenter {
  return {
    viewMode$: topicToStream(topicFromObservable(preferences.viewMode$())),
    setViewMode: (viewMode: ViewMode) => {
      preferences.setViewMode(viewMode);
    },
  };
}

/** `isCalm$` / `isFreeze$` are projections of ONE shared level topic, so
 * three warm consumers cost one port subscription, and — like the RxJS
 * `map` they replace — they re-publish an unchanged boolean when the level
 * changes underneath it (calm → freeze publishes `true` again). */
export function createPowerSaverPresenter(
  preferences: PreferencesPort,
): PowerSaverPresenter {
  const level = topicFromObservable(preferences.powerSaverLevel$());

  return {
    level$: topicToStream(level),
    isCalm$: topicToStream(
      mapTopic(level, (current) => {
        return current !== "off";
      }),
    ),
    isFreeze$: topicToStream(
      mapTopic(level, (current) => {
        return current === "freeze";
      }),
    ),
    setLevel: (next: PowerSaverLevel) => {
      preferences.setPowerSaverLevel(next);
    },
  };
}

export function createCreditRfqFilterPreferencePresenter(
  preferences: PreferencesPort,
): CreditRfqFilterPreferencePresenter {
  return {
    filter$: topicToStream(topicFromObservable(preferences.creditRfqFilter$())),
    setFilter: (filter: CreditRfqFilter) => {
      preferences.setCreditRfqFilter(filter);
    },
  };
}

export function createEqBlotterViewPreferencePresenter(
  preferences: PreferencesPort,
): EqBlotterViewPreferencePresenter {
  return {
    view$: topicToStream(topicFromObservable(preferences.eqBlotterView$())),
    setView: (view: EqBlotterView) => {
      preferences.setEqBlotterView(view);
    },
  };
}

export function createAmbientStylePresenter(
  preferences: PreferencesPort,
): AmbientStylePresenter {
  return {
    style$: topicToStream(topicFromObservable(preferences.ambientStyle$())),
    setStyle: (style: AmbientStyle) => {
      preferences.setAmbientStyle(style);
    },
  };
}

export function createChartSubstratePresenter(
  preferences: PreferencesPort,
): ChartSubstratePresenter {
  return {
    substrate$: topicToStream(
      topicFromObservable(preferences.chartSubstrate$()),
    ),
    setSubstrate: (substrate: ChartSubstrate) => {
      preferences.setChartSubstrate(substrate);
    },
  };
}

export function createLayoutEnginePresenter(
  preferences: PreferencesPort,
): LayoutEnginePresenter {
  return {
    engine$: topicToStream(topicFromObservable(preferences.layoutEngine$())),
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
  preferences: PreferencesPort,
): AnimatedBackgroundPresenter {
  return {
    enabled$: topicToStream(
      topicFromObservable(preferences.animatedBackground$()),
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
  preferences: PreferencesPort,
): ForceBootAnimationPresenter {
  return {
    enabled$: topicToStream(
      topicFromObservable(preferences.forceBootAnimation$()),
    ),
    set: (on: boolean) => {
      preferences.setForceBootAnimation(on);
    },
    toggle: (current: boolean) => {
      preferences.setForceBootAnimation(!current);
    },
  };
}
