// packages/client-core-effect/src/presenters/themePreference.test.ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  type PreferencesPort,
  PreferencesSimulator,
  type ThemeMode,
  type ThemeModePreference,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createThemePreferencePresenter } from "#/presenters/themePreference";

describe("createThemePreferencePresenter (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("without a colour-scheme source, 'system' resolves to light and mode$ still follows the preference", async () => {
    const preferences = new PreferencesSimulator({ themeMode: "system" });
    const presenter = createThemePreferencePresenter(useHost(), preferences);
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    expect(seen).toEqual(["light"]);
    await tick();
    presenter.setMode("dark");
    await tick();
    await tick();
    expect(seen).toEqual(["light", "dark"]);
    sub.unsubscribe();
  });

  it("re-resolves live when the OS scheme flips under 'system', and de-duplicates", async () => {
    const prefersDark = new BehaviorSubject(true);
    const presenter = createThemePreferencePresenter(
      useHost(),
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
    expect(seen).toEqual(["dark"]);
    await tick();
    prefersDark.next(false);
    prefersDark.next(false);
    await tick();
    await tick();
    expect(seen).toEqual(["dark", "light"]);
    sub.unsubscribe();
    await tick();
    expect(prefersDark.observed).toBe(false);
  });

  it("cycle() advances round the full ring, one step per call, from the stored value", async () => {
    const preferences = new PreferencesSimulator({ themeMode: "light" });
    const presenter = createThemePreferencePresenter(useHost(), preferences);
    const seen: string[] = [];
    const sub = presenter.modePreference$.subscribe((p) => {
      seen.push(p);
    });
    presenter.cycle();
    presenter.cycle();
    presenter.cycle();
    await tick();
    await tick();
    expect(seen).toEqual(["light", "system", "dark", "light"]);
    sub.unsubscribe();
  });

  it("mode$ delivers nothing until the port's first preference, rather than resolving an invented default", async () => {
    const { port, themeMode } = createSilentThemeModePort();
    const presenter = createThemePreferencePresenter(useHost(), port);
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    // A seed read from a port that has not emitted is `None`: seeding
    // `resolveThemeMode(DEFAULT_THEME_MODE_PREFERENCE, …)` here would put a
    // "light" on the wire that no other core emits.
    expect(seen).toEqual([]);
    await tick();
    expect(seen).toEqual([]);
    themeMode.next("dark");
    await tick();
    await tick();
    expect(seen).toEqual(["dark"]);
    sub.unsubscribe();
  });

  it("re-subscribes to the colour-scheme source on a fresh warm period", async () => {
    const prefersDark = new BehaviorSubject(false);
    const presenter = createThemePreferencePresenter(
      useHost(),
      new PreferencesSimulator({ themeMode: "system" }),
      {
        prefersDark$: () => {
          return prefersDark;
        },
      },
    );
    const first = presenter.mode$.subscribe(() => {});
    first.unsubscribe();
    await tick();
    await tick();
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    prefersDark.next(true);
    await tick();
    await tick();
    expect(seen).toEqual(["light", "dark"]);
    sub.unsubscribe();
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** A preferences port whose `themeMode$` is a plain `Subject` — it emits
 * NOTHING on subscribe, unlike every shipping adapter's replay-current
 * stream. The rest of the port stays the simulator's. */
function createSilentThemeModePort(): SilentThemeModePort {
  const themeMode = new Subject<ThemeModePreference>();
  const port: PreferencesPort = Object.assign(new PreferencesSimulator(), {
    themeMode$: () => {
      return themeMode;
    },
  });
  return { port, themeMode };
}

interface SilentThemeModePort {
  port: PreferencesPort;
  themeMode: Subject<ThemeModePreference>;
}

/** The host these tests build: a `ManagedRuntime` (which satisfies
 * `EffectRunner` structurally) plus the scope every stream fiber is forked
 * into — and, unlike the narrow `EffectHost`, the runtime's own `dispose`,
 * which the teardown drives directly. */
interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}
