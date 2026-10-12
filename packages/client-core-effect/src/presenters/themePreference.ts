// packages/client-core-effect/src/presenters/themePreference.ts
import { Effect, Option, Stream } from "effect";

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
  type PortEvents,
  portEvents,
  sharedFold,
} from "#/bridge/out";
import { peek, peekCurrent } from "#/bridge/peek";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

type ThemeEvent =
  | { readonly kind: "preference"; readonly preference: ThemeModePreference }
  | { readonly kind: "dark"; readonly dark: boolean };

/** `modePreference$` mirrors the stored choice. `mode$` is the RxJS core's
 * `combineLatest → map(resolveThemeMode) → distinctUntilChanged` as the two
 * ports through one queue (`fromPort.merged`) into a `sharedFold`: it
 * resolves from the latest of each once both have spoken, and the fold's
 * own `Object.is` guard is the de-duplication. No colour-scheme source means
 * the OS never prefers dark, from the start. */
export function createThemePreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
  colorScheme?: ColorSchemeSource,
): ThemePreferencePresenter {
  const modePreference = preferences.themeMode$();
  // `mode$` follows the stored choice through THIS stream, not through the
  // port again: with both streams held, the port has one subscriber, as on
  // the RxJS and async cores.
  const modePreference$ = mirrorPortAsIs(host, modePreference);
  const prefersDark =
    colorScheme === undefined ? undefined : colorScheme.prefersDark$();

  function prefersDarkNow(): boolean {
    return prefersDark === undefined ? false : peek(prefersDark, false);
  }

  function themeEvents(): readonly PortEvents<ThemeEvent>[] {
    const preferenceEvents = portEvents(
      modePreference$,
      (preference): ThemeEvent => {
        return { kind: "preference", preference };
      },
    );

    return prefersDark === undefined
      ? [preferenceEvents]
      : [
          preferenceEvents,
          portEvents(prefersDark, (dark): ThemeEvent => {
            return { kind: "dark", dark };
          }),
        ];
  }

  return {
    modePreference$,
    mode$: sharedFold(host, {
      /** `None` when the port has not emitted on subscribe: a READ must
       * not invent a default, or a port that is merely slow would push a
       * resolved `"light"` no other core emits (the divergence
       * `mirrorPort`'s seedless read removed). `cycle()` below keeps
       * `peek` WITH the default — a write has to advance from something. */
      seed: () => {
        return Option.map(peekCurrent(modePreference), (preference) => {
          return resolveThemeMode(preference, prefersDarkNow());
        });
      },
      run: (update: FoldUpdate<ThemeMode>, fromPort: FromPort) => {
        let preference: ThemeModePreference | undefined;
        let dark = prefersDark === undefined ? false : undefined;

        return fromPort.merged(themeEvents()).pipe(
          Stream.runForEach((event) => {
            if (event.kind === "preference") {
              preference = event.preference;
            } else {
              dark = event.dark;
            }

            if (preference === undefined || dark === undefined) {
              return Effect.void;
            }

            const resolved = resolveThemeMode(preference, dark);

            return update(() => {
              return resolved;
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
