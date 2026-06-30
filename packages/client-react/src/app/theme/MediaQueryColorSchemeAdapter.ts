import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";

import type { ColorSchemeSource } from "@rtc/client-core";

const QUERY = "(prefers-color-scheme: dark)";

/**
 * Browser `ColorSchemeSource` backed by `window.matchMedia`. Seeds a
 * BehaviorSubject from the current match (so subscribers get a value
 * synchronously — no flash) and pushes on every OS change. Where matchMedia is
 * unavailable (SSR / jsdom / older engines) it reports `false` and never
 * changes, so "system" resolves to light there. A single instance owned by the
 * composition root for the app's lifetime, so the change listener is not torn
 * down.
 */
export class MediaQueryColorSchemeAdapter implements ColorSchemeSource {
  private readonly dark: BehaviorSubject<boolean>;

  constructor() {
    const query =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(QUERY)
        : null;

    this.dark = new BehaviorSubject<boolean>(query?.matches ?? false);

    query?.addEventListener("change", (e: MediaQueryListEvent): void => {
      this.dark.next(e.matches);
    });
  }

  prefersDark$(): Observable<boolean> {
    return this.dark.pipe(distinctUntilChanged());
  }
}
