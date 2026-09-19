// packages/client-core-effect/src/presenters/themePreference.ts
import { Stream } from "effect";

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

import { fromObservable, peek } from "#/bridge/in";
import { type EffectHost, type FoldUpdate, sharedFold } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** `modePreference$` mirrors the stored choice. `mode$` is the RxJS core's
 * `combineLatest → map(resolveThemeMode) → distinctUntilChanged` as
 * `Stream.zipLatest` into a `sharedFold` — the fold's own `Object.is` guard
 * is the de-duplication. No colour-scheme source means the OS never prefers
 * dark: `Stream.make(false)` emits once and ends, and `zipLatest` keeps
 * following the live side after a finite side ends (measured on 3.22.2). */
export function createThemePreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
  colorScheme?: ColorSchemeSource,
): ThemePreferencePresenter {
  const modePreference = preferences.themeMode$();
  const prefersDark =
    colorScheme === undefined ? undefined : colorScheme.prefersDark$();

  function prefersDarkNow(): boolean {
    return prefersDark === undefined ? false : peek(prefersDark, false);
  }

  // Built INSIDE `run`, once per warm period: `fromObservable` subscribes
  // synchronously at CALL time (not lazily, on first pull), so a value built
  // once at construction and reused across cold → warm cycles would only
  // ever see the FIRST period's subscription — later periods would replay a
  // stream whose source was already unsubscribed by the first period's
  // `Stream.ensuring` finalizer, missing every later `prefersDark` flip.
  function buildPrefersDarkStream(): Stream.Stream<boolean, unknown> {
    return prefersDark === undefined
      ? Stream.make(false)
      : fromObservable(prefersDark);
  }

  return {
    modePreference$: mirrorPortAsIs(
      host,
      modePreference,
      DEFAULT_THEME_MODE_PREFERENCE,
    ),
    mode$: sharedFold(host, {
      seed: () => {
        return resolveThemeMode(
          peek(modePreference, DEFAULT_THEME_MODE_PREFERENCE),
          prefersDarkNow(),
        );
      },
      run: (update: FoldUpdate<ThemeMode>) => {
        return Stream.zipLatest(
          fromObservable(modePreference),
          buildPrefersDarkStream(),
        ).pipe(
          Stream.runForEach(([preference, dark]) => {
            return update(() => {
              return resolveThemeMode(preference, dark);
            });
          }),
        );
      },
    }),
    setMode: (next: ThemeModePreference) => {
      preferences.setThemeMode(next);
    },
    /** Advance from the TRUE stored value, read synchronously from the port
     * (`peek`), never from a caller's captured value. */
    cycle: () => {
      preferences.setThemeMode(
        nextThemeModePreference(
          peek(modePreference, DEFAULT_THEME_MODE_PREFERENCE),
        ),
      );
    },
  };
}
