import { cleanup, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

import { PanelErrorBoundary } from "#/ui/shell/layout/engine/PanelErrorBoundary";

export interface PanelErrorBoundaryPage {
  /** `children` is a thunk, not an already-built `JSX.Element` — a
   * component (e.g. the throw-on-render fixture) must run INSIDE the
   * boundary `render()` establishes, not eagerly at the call site, or its
   * throw escapes uncaught before `PanelErrorBoundary` exists to catch it. */
  mount(title: string, children: () => JSX.Element): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
}

/** The framework surface for `PanelErrorBoundary.test.tsx`. */
export function panelErrorBoundaryPage(): PanelErrorBoundaryPage {
  return {
    mount(title: string, children: () => JSX.Element): void {
      render(() => {
        return (
          <PanelErrorBoundary title={title}>{children()}</PanelErrorBoundary>
        );
      });
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
  };
}
