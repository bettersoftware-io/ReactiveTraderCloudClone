import { BehaviorSubject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type PreferencesPort,
  PreferencesSimulator,
  type ThemeMode,
} from "@rtc/domain";

import { createThemePreferencePresenter } from "#/presenters/themePreference";

describe("createThemePreferencePresenter (async)", () => {
  it("without a colour-scheme source, 'system' resolves to light and mode$ still follows the preference", () => {
    const preferences = new PreferencesSimulator({ themeMode: "system" });
    const presenter = createThemePreferencePresenter(preferences);
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    expect(seen).toEqual(["light"]);
    presenter.setMode("dark");
    expect(seen).toEqual(["light", "dark"]);
    sub.unsubscribe();
  });

  it("re-resolves live when the OS scheme flips under 'system', and de-duplicates", () => {
    const prefersDark = new BehaviorSubject(true);
    const presenter = createThemePreferencePresenter(
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
    prefersDark.next(false);
    expect(seen).toEqual(["dark", "light"]);
    sub.unsubscribe();
    expect(prefersDark.observed).toBe(false);
  });

  it("fails mode$ when the preference stream fails", async () => {
    const presenter = createThemePreferencePresenter(
      createPortWithFailingThemeMode(),
    );
    const errors: unknown[] = [];
    presenter.mode$.subscribe({
      next: () => {},
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toHaveLength(1);
  });
});

/** A real simulator whose `themeMode$` errors on subscribe. A Proxy rather
 * than an object spread: TypeScript drops a class's methods from a spread
 * type, so `{ ...simulator, themeMode$ }` would not satisfy
 * `PreferencesPort`; the proxy keeps every other method — and its `this` —
 * intact. */
function createPortWithFailingThemeMode(): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === "themeMode$") {
        return () => {
          return throwError(() => {
            return new Error("storage");
          });
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
