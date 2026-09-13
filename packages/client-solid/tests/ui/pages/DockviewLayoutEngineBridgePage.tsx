import { cleanup, render, waitFor } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

export interface DockviewLayoutEngineBridgePage {
  mount(element: () => JSX.Element): void;
  unmountAll(): void;
  /** Runs `assertion` until it stops throwing (or the timeout elapses) —
   * the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void): Promise<void>;
}

/** The framework surface for `DockviewLayoutEngine.popout.test.tsx` — the
 * solid bridge's jsdom wiring tests (the react twin reuses its StrictMode
 * page; solid has no StrictMode, so this page carries only render/waitFor). */
export function dockviewLayoutEngineBridgePage(): DockviewLayoutEngineBridgePage {
  return {
    mount(element: () => JSX.Element): void {
      render(element);
    },
    unmountAll(): void {
      cleanup();
    },
    waitFor(assertion: () => void): Promise<void> {
      return waitFor(assertion);
    },
  };
}
