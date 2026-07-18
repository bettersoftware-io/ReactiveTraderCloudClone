import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AmbientStyle,
  type BootVariant,
  type CreditRfqFilter,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type EqBlotterView,
  type EqWatchlistSort,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "#/preferences/preferences.js";

import type { PreferencesPort } from "../preferencesPort.js";

/** A pre-seeded preferences store. Partial — omitted keys fall back to defaults. */
export interface PreferencesSeed {
  themeMode?: ThemeModePreference;
  themeSkin?: ThemeSkin;
  viewMode?: ViewMode;
  animatedBackground?: boolean;
  powerSaver?: boolean;
  bootVariant?: BootVariant;
  creditRfqFilter?: CreditRfqFilter;
  eqWatchlistSort?: EqWatchlistSort;
  eqBlotterView?: EqBlotterView;
  ambientStyle?: AmbientStyle;
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

      let themeMode: ThemeModePreference | undefined;
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
      const seen: ThemeModePreference[] = [];
      const sub = port.themeMode$().subscribe((t) => {
        return seen.push(t);
      });

      port.setThemeMode("light");

      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_THEME_MODE, "light"]);
    });

    it("persists and reads back the 'system' mode preference", async () => {
      const port = makeEmpty();
      port.setThemeMode("system");
      expect(await firstValueFrom(port.themeMode$())).toBe("system");

      const seeded = makeSeeded({ themeMode: "system" });
      expect(await firstValueFrom(seeded.themeMode$())).toBe("system");
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

    it("empty store emits the default skin and animatedBackground=true", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.themeSkin$())).toBe(DEFAULT_THEME_SKIN);
      expect(await firstValueFrom(port.animatedBackground$())).toBe(true);
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
      // Default is true (empty store), so flip to false to observe a change.
      port.setAnimatedBackground(false);
      sub.unsubscribe();
      expect(seen).toEqual([true, false]);
    });

    it("reads back a seeded skin + animatedBackground", async () => {
      const port = makeSeeded({ themeSkin: "neon", animatedBackground: true });
      expect(await firstValueFrom(port.themeSkin$())).toBe("neon");
      expect(await firstValueFrom(port.animatedBackground$())).toBe(true);
    });

    it("empty store emits the default powerSaver=false", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.powerSaver$())).toBe(false);
    });

    it("setPowerSaver persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: boolean[] = [];
      const sub = port.powerSaver$().subscribe((on) => {
        return seen.push(on);
      });
      // Default is false (empty store), so flip to true to observe a change.
      port.setPowerSaver(true);
      sub.unsubscribe();
      expect(seen).toEqual([false, true]);
    });

    it("reads back a seeded powerSaver", async () => {
      const port = makeSeeded({ powerSaver: true });
      expect(await firstValueFrom(port.powerSaver$())).toBe(true);
    });

    it("empty store emits the default bootVariant", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.bootVariant$())).toBe(
        DEFAULT_BOOT_VARIANT,
      );
    });

    it("setBootVariant persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: BootVariant[] = [];
      const sub = port.bootVariant$().subscribe((v) => {
        return seen.push(v);
      });
      port.setBootVariant("laser");
      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_BOOT_VARIANT, "laser"]);
    });

    it("reads back a seeded bootVariant", async () => {
      const port = makeSeeded({ bootVariant: "docking" });
      expect(await firstValueFrom(port.bootVariant$())).toBe("docking");
    });

    it("empty store emits the default creditRfqFilter", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.creditRfqFilter$())).toBe(
        DEFAULT_CREDIT_RFQ_FILTER,
      );
    });

    it("setCreditRfqFilter persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: CreditRfqFilter[] = [];
      const sub = port.creditRfqFilter$().subscribe((f) => {
        return seen.push(f);
      });
      port.setCreditRfqFilter("closed");
      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_CREDIT_RFQ_FILTER, "closed"]);
    });

    it("reads back a seeded creditRfqFilter", async () => {
      const port = makeSeeded({ creditRfqFilter: "all" });
      expect(await firstValueFrom(port.creditRfqFilter$())).toBe("all");
    });

    it("empty store emits the default eqWatchlistSort and eqBlotterView", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.eqWatchlistSort$())).toBe(
        DEFAULT_EQ_WATCHLIST_SORT,
      );
      expect(await firstValueFrom(port.eqBlotterView$())).toBe(
        DEFAULT_EQ_BLOTTER_VIEW,
      );
    });

    it("setEqWatchlistSort persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: EqWatchlistSort[] = [];
      const sub = port.eqWatchlistSort$().subscribe((s) => {
        return seen.push(s);
      });
      port.setEqWatchlistSort("sym");
      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_EQ_WATCHLIST_SORT, "sym"]);
    });

    it("setEqBlotterView persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: EqBlotterView[] = [];
      const sub = port.eqBlotterView$().subscribe((v) => {
        return seen.push(v);
      });
      port.setEqBlotterView("positions");
      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_EQ_BLOTTER_VIEW, "positions"]);
    });

    it("reads back a seeded eqWatchlistSort and eqBlotterView", async () => {
      const port = makeSeeded({
        eqWatchlistSort: "price",
        eqBlotterView: "positions",
      });
      expect(await firstValueFrom(port.eqWatchlistSort$())).toBe("price");
      expect(await firstValueFrom(port.eqBlotterView$())).toBe("positions");
    });

    it("defaults ambientStyle to aurora and round-trips a write", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.ambientStyle$())).toBe(
        DEFAULT_AMBIENT_STYLE,
      );
      port.setAmbientStyle("rays");
      expect(await firstValueFrom(port.ambientStyle$())).toBe("rays");
      // late subscriber sees the current value synchronously (replay-current)
      expect(await firstValueFrom(port.ambientStyle$())).toBe("rays");
    });

    it("setAmbientStyle persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: AmbientStyle[] = [];
      const sub = port.ambientStyle$().subscribe((s) => {
        return seen.push(s);
      });
      port.setAmbientStyle("rays");
      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_AMBIENT_STYLE, "rays"]);
    });

    it("reads back a seeded ambientStyle", async () => {
      const port = makeSeeded({ ambientStyle: "rays" });
      expect(await firstValueFrom(port.ambientStyle$())).toBe("rays");
    });
  });
}
