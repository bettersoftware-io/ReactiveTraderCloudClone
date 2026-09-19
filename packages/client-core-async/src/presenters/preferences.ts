import type {
  PowerSaverPresenter,
  ThemeSkinPreferencePresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";
import type {
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
