import {
  THEME_MODE_PREFERENCES,
  type ThemeModePreference,
  type ThemeSkin,
} from "@rtc/domain";

/** The design groups skins by family — the two HOLO variants, then the two
 * TERMINAL variants, then NEON, then CLASSIC — reading left-to-right across a
 * 3x2 grid (reference-shots/shell/appearance.png). The DOMAIN order is
 * alphabetical-ish and puts CLASSIC first; that order still governs storage and
 * every other consumer, so this is a VIEW ordering only. The permutation test
 * guards the real risk: a skin silently dropped from the grid would be
 * unreachable on mobile with nothing else noticing. */
export const SKIN_DISPLAY_ORDER: readonly ThemeSkin[] = [
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
  "neon",
  "classic",
];

/** How many `cycle()` calls move `current` to `target`.
 *
 * The ViewModel exposes no mode setter — `useThemePreference()` is
 * `{ mode, modePreference, cycle }` — so a segmented control cannot assign a
 * mode; it can only advance the cycle N times. `cycle()` re-reads the live
 * persisted preference on each call rather than a captured render value, so
 * firing it synchronously N times still lands on the true target. The
 * presenter behind `cycle()` is guarded directly by
 * `packages/client-core/src/presenters/__tests__/ThemePreferencePresenter.test.ts`
 * ("cycle advances dark → light → system → dark from the live current
 * value") — this function only computes how many times to call it.
 *
 * Widened from the previous `"dark" | "light"` version: the 3-way segment can
 * now select `system`, which the old 2-way toggle could not express. */
export function cyclesToReach(
  current: ThemeModePreference,
  target: ThemeModePreference,
): number {
  const from = THEME_MODE_PREFERENCES.indexOf(current);
  const to = THEME_MODE_PREFERENCES.indexOf(target);
  const span = THEME_MODE_PREFERENCES.length;
  return (to - from + span) % span;
}
