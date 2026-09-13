import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";

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
}

/** The framework surface for `PanelHeadControls.test.tsx`. */
export function panelHeadControlsPage(): PanelHeadControlsPage {
  return {
    mount(props: PanelHeadControlsProps): void {
      render(() => {
        return <PanelHeadControls {...props} />;
      });
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
  };
}
