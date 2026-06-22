import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  DEFAULT_VIEW_MODE,
  type Theme,
  type ViewMode,
} from "../../preferences/preferences.js";
import type { PreferencesPort } from "../preferencesPort.js";

/** A pre-seeded preferences store. Partial — omitted keys fall back to defaults. */
export interface PreferencesSeed {
  theme?: Theme;
  viewMode?: ViewMode;
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
      expect(await firstValueFrom(port.theme$())).toBe(DEFAULT_THEME);
      expect(await firstValueFrom(port.viewMode$())).toBe(DEFAULT_VIEW_MODE);
    });

    it("emits the current value synchronously on subscribe (no flash)", () => {
      const port = makeEmpty();
      port.setTheme("light");
      port.setViewMode("price");

      let theme: Theme | undefined;
      let viewMode: ViewMode | undefined;
      port
        .theme$()
        .subscribe((t) => (theme = t))
        .unsubscribe();
      port
        .viewMode$()
        .subscribe((v) => (viewMode = v))
        .unsubscribe();

      // Synchronous: values are set by the time .subscribe() returns.
      expect(theme).toBe("light");
      expect(viewMode).toBe("price");
    });

    it("setTheme persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: Theme[] = [];
      const sub = port.theme$().subscribe((t) => seen.push(t));

      port.setTheme("light");

      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_THEME, "light"]);
    });

    it("setViewMode persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: ViewMode[] = [];
      const sub = port.viewMode$().subscribe((v) => seen.push(v));

      port.setViewMode("price");

      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_VIEW_MODE, "price"]);
    });

    it("reads back a seeded store", async () => {
      const port = makeSeeded({ theme: "light", viewMode: "price" });
      expect(await firstValueFrom(port.theme$())).toBe("light");
      expect(await firstValueFrom(port.viewMode$())).toBe("price");
    });

    it("falls back to defaults for unseeded keys", async () => {
      const port = makeSeeded({ theme: "light" });
      expect(await firstValueFrom(port.theme$())).toBe("light");
      expect(await firstValueFrom(port.viewMode$())).toBe(DEFAULT_VIEW_MODE);
    });
  });
}
