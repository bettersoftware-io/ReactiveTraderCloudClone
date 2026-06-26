import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type ThemeMode,
  type ThemeSkin,
  type ViewMode,
} from "#/preferences/preferences.js";

import type { PreferencesPort } from "../preferencesPort.js";

/** A pre-seeded preferences store. Partial — omitted keys fall back to defaults. */
export interface PreferencesSeed {
  themeMode?: ThemeMode;
  themeSkin?: ThemeSkin;
  viewMode?: ViewMode;
  animatedBackground?: boolean;
}

/**
 * Behavioural contract for PreferencesPort. Each implementation supplies:
 *  - makeEmpty():  a port over an empty store (no prior values).
 *  - makeSeeded(): a port over a store pre-loaded with the given seed.
 *
 * The streams are replay-current: a subscriber receives the current value
 * synchronously on subscribe (BehaviorSubject semantics), which is the
 * no-theme-flash contract.
 */
export function describePreferencesPortContract(
  label: string,
  makeEmpty: () => PreferencesPort,
  makeSeeded: (seed: PreferencesSeed) => PreferencesPort,
): void {
  describe(`${label} :: PreferencesPort contract`, () => {
    it("empty store emits the default theme and view mode first", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.themeMode$())).toBe(DEFAULT_THEME_MODE);
      expect(await firstValueFrom(port.viewMode$())).toBe(DEFAULT_VIEW_MODE);
    });

    it("emits the current value synchronously on subscribe (no flash)", () => {
      const port = makeEmpty();
      port.setThemeMode("light");
      port.setViewMode("price");

      let themeMode: ThemeMode | undefined;
      let viewMode: ViewMode | undefined;
      port
        .themeMode$()
        .subscribe((t) => {
          themeMode = t;
        })
        .unsubscribe();
      port
        .viewMode$()
        .subscribe((v) => {
          viewMode = v;
        })
        .unsubscribe();

      // Synchronous: values are set by the time .subscribe() returns.
      expect(themeMode).toBe("light");
      expect(viewMode).toBe("price");
    });

    it("setThemeMode persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: ThemeMode[] = [];
      const sub = port.themeMode$().subscribe((t) => {
        return seen.push(t);
      });

      port.setThemeMode("light");

      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_THEME_MODE, "light"]);
    });

    it("setViewMode persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: ViewMode[] = [];
      const sub = port.viewMode$().subscribe((v) => {
        return seen.push(v);
      });

      port.setViewMode("price");

      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_VIEW_MODE, "price"]);
    });

    it("reads back a seeded store", async () => {
      const port = makeSeeded({ themeMode: "light", viewMode: "price" });
      expect(await firstValueFrom(port.themeMode$())).toBe("light");
      expect(await firstValueFrom(port.viewMode$())).toBe("price");
    });

    it("falls back to defaults for unseeded keys", async () => {
      const port = makeSeeded({ themeMode: "light" });
      expect(await firstValueFrom(port.themeMode$())).toBe("light");
      expect(await firstValueFrom(port.viewMode$())).toBe(DEFAULT_VIEW_MODE);
    });

    it("empty store emits the default skin and animatedBackground=false", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.themeSkin$())).toBe(DEFAULT_THEME_SKIN);
      expect(await firstValueFrom(port.animatedBackground$())).toBe(false);
    });

    it("setThemeSkin persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: ThemeSkin[] = [];
      const sub = port.themeSkin$().subscribe((s) => {
        return seen.push(s);
      });
      port.setThemeSkin("terminal");
      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_THEME_SKIN, "terminal"]);
    });

    it("setAnimatedBackground persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: boolean[] = [];
      const sub = port.animatedBackground$().subscribe((on) => {
        return seen.push(on);
      });
      port.setAnimatedBackground(true);
      sub.unsubscribe();
      expect(seen).toEqual([false, true]);
    });

    it("reads back a seeded skin + animatedBackground", async () => {
      const port = makeSeeded({ themeSkin: "neon", animatedBackground: true });
      expect(await firstValueFrom(port.themeSkin$())).toBe("neon");
      expect(await firstValueFrom(port.animatedBackground$())).toBe(true);
    });
  });
}
