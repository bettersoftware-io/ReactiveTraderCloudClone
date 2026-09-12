import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";

interface WaitForOptions {
  timeout: number;
}

export interface DockviewLayoutEngineStrictModePage {
  mount(element: ReactElement): void;
  unmountAll(): void;
  /** Runs `assertion` until it stops throwing (or `options.timeout` elapses)
   * — the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void, options?: WaitForOptions): Promise<void>;
  /** The engine's `data-groups` witness — how many dockview groups the
   * mounted engine currently reports, as a string (the attribute's raw
   * form). */
  groupsAttr(): string | null;
  /** Whether a testid the registry/portal tree renders is present. */
  bodyVisible(testId: string): boolean;
}

/** The framework surface for `DockviewLayoutEngine.strictMode.test.tsx`. The
 * spec composes its own `<StrictMode>` wrapper around `DockviewLayoutEngine`
 * (kept spec-side — moving it page-side would obscure what the test actually
 * mounts), so this page owns only the render/waitFor mechanics. */
export function dockviewLayoutEngineStrictModePage(): DockviewLayoutEngineStrictModePage {
  return {
    mount(element: ReactElement): void {
      render(element);
    },
    unmountAll(): void {
      cleanup();
    },
    waitFor(assertion: () => void, options?: WaitForOptions): Promise<void> {
      return waitFor(assertion, options);
    },
    groupsAttr(): string | null {
      return screen.getByTestId("layout-engine").getAttribute("data-groups");
    },
    bodyVisible(testId: string): boolean {
      return screen.queryByTestId(testId) !== null;
    },
  };
}
