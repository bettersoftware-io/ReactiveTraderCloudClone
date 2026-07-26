import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaQueryColorSchemeAdapter } from "./MediaQueryColorSchemeAdapter";

// This adapter is how "system" theme follows the OS. Two things had no witness:
// the CHANGE listener (without it the app seeds correctly at boot and then
// never follows the OS again — a bug that looks like nothing at startup), and
// the no-matchMedia fallback that keeps SSR/jsdom/older engines on light
// instead of throwing.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MediaQueryColorSchemeAdapter", () => {
  it("seeds from the current match", async () => {
    stubMatchMedia(true);

    const adapter = new MediaQueryColorSchemeAdapter();

    expect(await firstValueFrom(adapter.prefersDark$())).toBe(true);
  });

  it("pushes every OS change to subscribers", async () => {
    const media = stubMatchMedia(false);
    const adapter = new MediaQueryColorSchemeAdapter();

    const collected = firstValueFrom(
      adapter.prefersDark$().pipe(take(3), toArray()),
    );

    media.emit(true);
    media.emit(false);

    expect(await collected).toEqual([false, true, false]);
  });

  it("de-duplicates repeats of the same value", async () => {
    const media = stubMatchMedia(false);
    const adapter = new MediaQueryColorSchemeAdapter();

    const collected = firstValueFrom(
      adapter.prefersDark$().pipe(take(2), toArray()),
    );

    media.emit(false); // repeat of the seed — must not surface
    media.emit(true);

    expect(await collected).toEqual([false, true]);
  });

  it("reports light and never changes where matchMedia is unavailable", async () => {
    // `window` exists under jsdom but matchMedia may not; the adapter guards on
    // the FUNCTION, not just the global, so remove it rather than the window.
    vi.stubGlobal("window", { ...globalThis.window, matchMedia: undefined });

    const adapter = new MediaQueryColorSchemeAdapter();

    expect(await firstValueFrom(adapter.prefersDark$())).toBe(false);
  });
});

interface StubbedMedia {
  emit: (matches: boolean) => void;
}

/** Installs a matchMedia whose MediaQueryList records its change listeners, so
 * a test can drive an OS theme flip. */
function stubMatchMedia(initialMatches: boolean): StubbedMedia {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];

  vi.stubGlobal("window", {
    ...globalThis.window,
    matchMedia: (media: string) => {
      return {
        matches: initialMatches,
        media,
        addEventListener: (
          _type: string,
          listener: (e: MediaQueryListEvent) => void,
        ) => {
          listeners.push(listener);
        },
        removeEventListener: () => {},
      };
    },
  });

  return {
    emit: (matches: boolean) => {
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
}
