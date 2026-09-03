import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { PanelErrorBoundary } from "#/ui/shell/layout/engine/PanelErrorBoundary";

export interface PanelErrorBoundaryPage {
  mount(title: string, children: ReactNode): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
}

/** The framework surface for `PanelErrorBoundary.test.tsx`. */
export function panelErrorBoundaryPage(): PanelErrorBoundaryPage {
  return {
    mount(title: string, children: ReactNode): void {
      render(<PanelErrorBoundary title={title}>{children}</PanelErrorBoundary>);
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
