import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

export interface UseJarvisDrivenPulsePage {
  /** Mounts the given element builder — each spec declares its own
   * Harness/TestApp component pair (kept spec-side: the double-component
   * shape dodges an eslint-plugin-solid reactivity false positive — see the
   * spec's own comment), so this page owns only the render mechanic. */
  mount(element: () => JSX.Element): void;
  unmountAll(): void;
  /** The wrapper's raw `data-jarvis-driven` attribute — kept as the exact
   * `"true" | "false" | null` fact (not collapsed to a boolean) so a missing
   * attribute stays distinguishable from an explicit `"false"`. */
  wrapperDrivenAttr(testId: string): string | null;
  /** Fires the WebKit-prefixed `animationend` name jsdom falls back to (no
   * `window.AnimationEvent` here) on the element at `testId`. */
  fireAnimationEnd(testId: string): void;
}

/** The framework surface for `useJarvisDrivenPulse.test.tsx`. Named without a
 * `use` prefix (unlike the hook it wraps) so calling it once at module scope
 * in the spec doesn't trip eslint-plugin-solid's reactivity/hook heuristics —
 * mirrors client-react's `jarvisDrivenPulsePage` precedent. */
export function jarvisDrivenPulsePage(): UseJarvisDrivenPulsePage {
  return {
    mount(element: () => JSX.Element): void {
      render(element);
    },
    unmountAll(): void {
      cleanup();
    },
    wrapperDrivenAttr(testId: string): string | null {
      return screen.getByTestId(testId).getAttribute("data-jarvis-driven");
    },
    fireAnimationEnd(testId: string): void {
      fireEvent(
        screen.getByTestId(testId),
        new Event("webkitAnimationEnd", { bubbles: true, cancelable: false }),
      );
    },
  };
}
