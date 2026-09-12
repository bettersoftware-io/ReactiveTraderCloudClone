import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";

interface WaitForOptions {
  timeout: number;
}

export interface DockviewLayoutEngineStrictModePage {
  mount(element: ReactElement): void;
  /** Re-renders the LAST mount with new props — the prop-flip half of a
   * replay spec (a fresh mount would rebuild the engine instead). */
  rerender(element: ReactElement): void;
  unmountAll(): void;
  /** Runs `assertion` until it stops throwing (or `options.timeout` elapses)
   * — the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void, options?: WaitForOptions): Promise<void>;
}

/** The framework surface for `DockviewLayoutEngine.strictMode.test.tsx`. The
 * spec composes its own `<StrictMode>` wrapper around `DockviewLayoutEngine`
 * (kept spec-side — moving it page-side would obscure what the test actually
 * mounts), so this page owns only the render/waitFor mechanics. */
export function dockviewLayoutEngineStrictModePage(): DockviewLayoutEngineStrictModePage {
  let last: ReturnType<typeof render> | null = null;

  return {
    mount(element: ReactElement): void {
      last = render(element);
    },
    rerender(element: ReactElement): void {
      if (last === null) {
        throw new Error("rerender before mount");
      }

      last.rerender(element);
    },
    unmountAll(): void {
      cleanup();
    },
    waitFor(assertion: () => void, options?: WaitForOptions): Promise<void> {
      return waitFor(assertion, options);
    },
  };
}
