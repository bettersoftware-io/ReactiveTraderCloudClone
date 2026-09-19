// packages/client-core-effect/src/presenters/themePreference.ts
import { Option, Stream } from "effect";

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

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";
import { peek } from "#/bridge/peek";
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

  // Subscribed through `fromPort`, so the period owns the subscription:
  // closing the period's scope releases it, and the next period opens its
  // own — a value built once at construction would only ever carry the
  // FIRST period's subscription.
  function buildPrefersDarkStream(
    fromPort: FromPort,
  ): Stream.Stream<boolean, unknown> {
    return prefersDark === undefined
      ? Stream.make(false)
      : fromPort(prefersDark);
  }

  return {
    modePreference$: mirrorPortAsIs(host, modePreference),
    mode$: sharedFold(host, {
      seed: () => {
        return Option.some(
          resolveThemeMode(
            peek(modePreference, DEFAULT_THEME_MODE_PREFERENCE),
            prefersDarkNow(),
          ),
        );
      },
      run: (update: FoldUpdate<ThemeMode>, fromPort: FromPort) => {
        return Stream.zipLatest(
          fromPort(modePreference),
          buildPrefersDarkStream(fromPort),
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
