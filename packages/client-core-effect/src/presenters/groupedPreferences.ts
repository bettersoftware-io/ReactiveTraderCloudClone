import type {
  JarvisPreferencesPresenter,
  LoginWaitPreferencesPresenter,
} from "@rtc/core-api";
import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_NARRATOR,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisNarratorPreference,
  type LoginWaitDelay,
  type LoginWaitStyle,
  type PreferencesPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** Presenters that group several independent preferences under one member
 * because the UI always shows them together. Each stream is its own
 * `mirrorPortAsIs` over its own port stream — its own warm period, its own
 * port subscription — so setting one never emits on another. */

export function createLoginWaitPreferencesPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): LoginWaitPreferencesPresenter {
  return {
    style$: mirrorPortAsIs(
      host,
      preferences.loginWaitStyle$(),
      DEFAULT_LOGIN_WAIT_STYLE,
    ),
    delay$: mirrorPortAsIs(
      host,
      preferences.loginWaitDelay$(),
      DEFAULT_LOGIN_WAIT_DELAY,
    ),
    setStyle: (style: LoginWaitStyle) => {
      preferences.setLoginWaitStyle(style);
    },
    setDelay: (delay: LoginWaitDelay) => {
      preferences.setLoginWaitDelay(delay);
    },
  };
}

export function createJarvisPreferencesPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): JarvisPreferencesPresenter {
  return {
    brain$: mirrorPortAsIs(
      host,
      preferences.jarvisBrain$(),
      DEFAULT_JARVIS_BRAIN,
    ),
    effort$: mirrorPortAsIs(
      host,
      preferences.jarvisEffort$(),
      DEFAULT_JARVIS_EFFORT,
    ),
    narrator$: mirrorPortAsIs(
      host,
      preferences.jarvisNarrator$(),
      DEFAULT_JARVIS_NARRATOR,
    ),
    setBrain: (brain: JarvisBrain) => {
      preferences.setJarvisBrain(brain);
    },
    setEffort: (effort: JarvisEffort) => {
      preferences.setJarvisEffort(effort);
    },
    setNarrator: (preference: JarvisNarratorPreference) => {
      preferences.setJarvisNarrator(preference);
    },
  };
}
