import { BehaviorSubject, firstValueFrom, type Observable } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type PreferencesPort,
  PreferencesSimulator,
  type ThemeMode,
  type ThemeModePreference,
} from "@rtc/domain";

import type { ColorSchemeSource } from "#/theme/colorSchemeSource";

import { ThemePreferencePresenter } from "../ThemePreferencePresenter";

describe("ThemePreferencePresenter", () => {
  it("replays the current mode preference", async () => {
    const presenter = new ThemePreferencePresenter(
      new PreferencesSimulator({ themeMode: "system" }),
      colorScheme(true),
    );
    expect(await firstValueFrom(presenter.modePreference$)).toBe("system");
  });

  it("resolves a concrete preference straight through to mode$", async () => {
    const presenter = new ThemePreferencePresenter(
      new PreferencesSimulator({ themeMode: "light" }),
      colorScheme(true),
    );
    expect(await firstValueFrom(presenter.mode$)).toBe("light");
  });

  it("resolves 'system' against the OS colour scheme", async () => {
    const dark = new ThemePreferencePresenter(
      new PreferencesSimulator({ themeMode: "system" }),
      colorScheme(true),
    );
    expect(await firstValueFrom(dark.mode$)).toBe("dark");

    const light = new ThemePreferencePresenter(
      new PreferencesSimulator({ themeMode: "system" }),
      colorScheme(false),
    );
    expect(await firstValueFrom(light.mode$)).toBe("light");
  });

  it("re-resolves mode$ live when the OS scheme flips under 'system'", () => {
    const prefersDark = new BehaviorSubject<boolean>(true);
    const presenter = new ThemePreferencePresenter(
      new PreferencesSimulator({ themeMode: "system" }),
      {
        prefersDark$: () => {
          return prefersDark;
        },
      },
    );
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    prefersDark.next(false);
    sub.unsubscribe();
    expect(seen).toEqual(["dark", "light"]);
  });

  it("cycle advances dark → light → system → dark from the live current value", () => {
    const prefs = new PreferencesSimulator();
    const presenter = new ThemePreferencePresenter(prefs, colorScheme(true));
    const seen: ThemeModePreference[] = [];
    const sub = presenter.modePreference$.subscribe((p) => {
      seen.push(p);
    });
    // Three zero-arg cycles in a row — each must advance from the true current
    // value (no stale-closure no-op), even back-to-back.
    presenter.cycle();
    presenter.cycle();
    presenter.cycle();
    sub.unsubscribe();
    expect(seen).toEqual(["dark", "light", "system", "dark"]);
  });

  it("cycle() twice calls themeMode$() once (the stream is captured at construction)", () => {
    const { port, callCount } = createCountingThemeModePort();
    const presenter = new ThemePreferencePresenter(port, colorScheme(true));

    presenter.cycle();
    presenter.cycle();

    expect(callCount()).toBe(1);
  });
});

function colorScheme(prefersDark: boolean): ColorSchemeSource {
  return {
    prefersDark$: (): Observable<boolean> => {
      return new BehaviorSubject<boolean>(prefersDark);
    },
  };
}

/** A `PreferencesPort` fake whose `themeMode$()` call count is observable. */
interface CountingThemeModePort {
  readonly port: PreferencesPort;
  readonly callCount: () => number;
}

/** Wraps a real `PreferencesSimulator` so `themeMode$()` calls are counted —
 * a Proxy rather than a spread, since the simulator's methods live on its
 * prototype and a spread would drop them. */
function createCountingThemeModePort(): CountingThemeModePort {
  const sim = new PreferencesSimulator();
  let calls = 0;
  const port = new Proxy(sim, {
    get: (
      target: PreferencesSimulator,
      prop: string | symbol,
      receiver: unknown,
    ): unknown => {
      const value = Reflect.get(target, prop, receiver);

      if (prop === "themeMode$" && typeof value === "function") {
        return (...args: unknown[]) => {
          calls += 1;
          return Reflect.apply(
            value as (...a: unknown[]) => unknown,
            target,
            args,
          );
        };
      }

      return value;
    },
  });
  return {
    port,
    callCount: () => {
      return calls;
    },
  };
}
