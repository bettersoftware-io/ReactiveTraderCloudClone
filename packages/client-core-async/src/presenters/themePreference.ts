import type {
  ColorSchemeSource,
  ThemePreferencePresenter,
} from "@rtc/core-api";
import {
  DEFAULT_THEME_MODE_PREFERENCE,
  nextThemeModePreference,
  type PreferencesPort,
  resolveThemeMode,
  type ThemeMode,
  type ThemeModePreference,
} from "@rtc/domain";

import { peek, relay, topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { relayTopic } from "#/kernel/relayTopic";
import { createTopic } from "#/kernel/topic";

/** `modePreference$` mirrors the stored choice. `mode$` is the RxJS core's
 * `combineLatest([modePreference$, prefersDark$]) → map(resolveThemeMode) →
 * distinctUntilChanged`, written as ONE producer: the two inputs held in
 * locals, a resolve on every input, a publish only when the resolved mode
 * changed. No colour-scheme source means the OS never prefers dark — the
 * RxJS core's `of(false)` fallback, without a stream to subscribe. */
export function createThemePreferencePresenter(
  preferences: PreferencesPort,
  colorScheme?: ColorSchemeSource,
): ThemePreferencePresenter {
  // Called ONCE, here — `modePreference$` and `cycle()` both read through
  // this same Observable rather than a fresh call of `themeMode$()`.
  const themeMode = preferences.themeMode$();
  const modePreference = topicFromObservable(themeMode);
  // Likewise ONCE, at construction rather than inside the producer: the
  // producer runs per WARM PERIOD, so a `prefersDark$()` call in there is a
  // port method invoked again on every cold → warm cycle. What the period
  // owns is the SUBSCRIPTION (`relay`, released on abort), never the call.
  const prefersDarkSource =
    colorScheme === undefined ? undefined : colorScheme.prefersDark$();

  const mode = createTopic<ThemeMode>(
    async (signal, publish) => {
      let preference: ThemeModePreference | null = null;
      let prefersDark: boolean | null = null;
      let published: ThemeMode | null = null;

      function resolve(): void {
        if (preference === null || prefersDark === null) {
          return;
        }

        const next = resolveThemeMode(preference, prefersDark);

        if (next !== published) {
          published = next;
          publish(next);
        }
      }

      // `relayTopic` owns the subscription, its synchronous release on
      // abort, and the rule that a failing source fails this producer.
      const preferenceRelay = relayTopic(
        modePreference,
        signal,
        (value: ThemeModePreference) => {
          preference = value;
          resolve();
        },
      );

      if (prefersDarkSource === undefined) {
        prefersDark = false;
        resolve();
        await preferenceRelay;
      } else {
        await Promise.race([
          preferenceRelay,
          relay(prefersDarkSource, signal, (value) => {
            prefersDark = value;
            resolve();
          }),
        ]);
      }
    },
    { replay: true },
  );

  return {
    modePreference$: topicToStream(modePreference),
    mode$: topicToStream(mode),
    setMode: (next: ThemeModePreference) => {
      preferences.setThemeMode(next);
    },
    /** Advance from the TRUE stored value, read synchronously from the port
     * (`peek`), never from a caller's captured value — rapid successive
     * clicks each advance from the real state. */
    cycle: () => {
      preferences.setThemeMode(
        nextThemeModePreference(peek(themeMode, DEFAULT_THEME_MODE_PREFERENCE)),
      );
    },
  };
}
