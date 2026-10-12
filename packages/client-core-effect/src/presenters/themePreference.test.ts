// packages/client-core-effect/src/presenters/themePreference.test.ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject, Observable, Subject } from "rxjs";
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

  // Both theme streams read the stored choice. Held together (an attached
  // devtools inspector holds both) they share ONE subscription to the port,
  // as the RxJS and async cores do; each used to open its own.
  it("modePreference$ and mode$ held together share one subscription to the port", async () => {
    const counted = createCountedThemeModePort("dark");
    const presenter = createThemePreferencePresenter(useHost(), counted.port);
    const preferences: ThemeModePreference[] = [];
    const modes: ThemeMode[] = [];
    const preferenceSub = presenter.modePreference$.subscribe((p) => {
      preferences.push(p);
    });

    const modeSub = presenter.mode$.subscribe((m) => {
      modes.push(m);
    });
    await tick();
    await tick();

    expect(counted.live()).toBe(1);

    // Positive witness: both streams are wired to that one subscription.
    counted.source.next("light");
    await tick();
    await tick();
    expect(preferences).toEqual(["dark", "light"]);
    expect(modes).toEqual(["dark", "light"]);

    preferenceSub.unsubscribe();
    modeSub.unsubscribe();
    await tick();
    expect(counted.live()).toBe(0);
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

interface CountedThemeModePort {
  readonly port: PreferencesPort;
  readonly source: BehaviorSubject<ThemeModePreference>;
  /** How many subscriptions to `themeMode$()` are open right now. */
  live(): number;
}

/** A preferences port whose `themeMode$` counts its open subscriptions. */
function createCountedThemeModePort(
  initial: ThemeModePreference,
): CountedThemeModePort {
  const source = new BehaviorSubject<ThemeModePreference>(initial);
  let live = 0;
  const themeMode = new Observable<ThemeModePreference>((subscriber) => {
    live += 1;
    const sub = source.subscribe(subscriber);

    return (): void => {
      live -= 1;
      sub.unsubscribe();
    };
  });
  const port = new PreferencesSimulator({ themeMode: initial });

  port.themeMode$ = (): Observable<ThemeModePreference> => {
    return themeMode;
  };

  return {
    port,
    source,
    live: () => {
      return live;
    },
  };
}

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
