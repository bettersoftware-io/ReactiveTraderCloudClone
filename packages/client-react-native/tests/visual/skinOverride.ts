import type { ThemeMode, ThemeSkin } from "@rtc/domain";

/** A skin×mode that replaces the one a scenario pins.
 *
 * Every scenario pins ONE skin×mode, because a golden has to reproduce itself.
 * That leaves ten of the twelve cells with no capture at all, and the Phase 7
 * sign-off is "every module in all 6 themes × dark/light". This override lets
 * the same scenarios be re-shot in any cell — to a scratch directory only; a
 * golden is never captured or compared under an override (`run.ts` refuses). */
export interface SkinOverride {
  skin: ThemeSkin;
  mode: ThemeMode;
}

// Spelled out here rather than imported from `@rtc/domain`'s `THEME_SKINS`:
// the simctl runner loads this file under plain Node, where a runtime import
// of the ESM-only domain package does not resolve (types are fine). A `Record`
// keyed by the domain union keeps it honest — a seventh skin fails typecheck
// here until it is listed.
const SKINS: Record<ThemeSkin, true> = {
  classic: true,
  holo: true,
  holo3d: true,
  terminal: true,
  terminal3d: true,
  neon: true,
};

const MODES: Record<ThemeMode, true> = { dark: true, light: true };

/** Both halves or nothing: a lone skin or a lone mode would silently mix the
 * override with the scenario's pin, and a typo would silently capture the
 * pinned cell under the wrong file name. Anything but two known values is
 * `null`, which the route renders as an explicit error rather than a shot. */
export function parseSkinOverride(
  skin: string | undefined,
  mode: string | undefined,
): SkinOverride | null {
  if (
    skin === undefined ||
    mode === undefined ||
    !isSkin(skin) ||
    !isMode(mode)
  ) {
    return null;
  }

  return { skin, mode };
}

/** `neon:light` → an override; the `--skin=` flag's own spelling. */
export function parseSkinFlag(value: string): SkinOverride | null {
  const [skin, mode, ...rest] = value.split(":");

  return rest.length === 0 ? parseSkinOverride(skin, mode) : null;
}

function isSkin(value: string): value is ThemeSkin {
  return Object.hasOwn(SKINS, value);
}

function isMode(value: string): value is ThemeMode {
  return Object.hasOwn(MODES, value);
}
