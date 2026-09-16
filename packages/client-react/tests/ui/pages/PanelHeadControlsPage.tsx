import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  PanelHeadControls,
  type PanelHeadControlsProps,
} from "#/ui/shell/layout/engine/PanelHeadControls";

export interface PanelHeadControlsPage {
  mount(props: PanelHeadControlsProps): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  disabled(testId: string): boolean;
  click(testId: string): void;
  /** The control's `aria-label` — the float control's label swaps between
   * "Float …" and "Dock …" with `floatingHere`. */
  label(testId: string): string | null;
}

/** The framework surface for `PanelHeadControls.test.tsx`. */
export function panelHeadControlsPage(): PanelHeadControlsPage {
  return {
    mount(props: PanelHeadControlsProps): void {
      render(<PanelHeadControls {...props} />);
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    disabled(testId: string): boolean {
      return (screen.getByTestId(testId) as HTMLButtonElement).disabled;
    },
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
    label(testId: string): string | null {
      return screen.getByTestId(testId).getAttribute("aria-label");
    },
  };
}
