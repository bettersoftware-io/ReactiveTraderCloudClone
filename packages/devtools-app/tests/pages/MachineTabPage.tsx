import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { MachineTabProps } from "#/timeline/MachineTab";
import { MachineTab } from "#/timeline/MachineTab";

export interface MachineTabPage {
  mountMachineTab(props: MachineTabProps): void;
  unmountAll(): void;
  hasText(text: string): boolean;
  hasTestId(testId: string): boolean;
  testIdTexts(testId: string): (string | null)[];
  click(testId: string): void;
  clickText(text: string): void;
  changeLabeledInput(label: string, value: string): void;
}

/** The framework surface for `MachineTab.test.tsx`. */
export function machineTabPage(): MachineTabPage {
  return {
    mountMachineTab(props: MachineTabProps): void {
      render(<MachineTab {...props} />);
    },
    unmountAll(): void {
      cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTestId(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    testIdTexts(testId: string): (string | null)[] {
      return screen.getAllByTestId(testId).map((el) => {
        return el.textContent;
      });
    },
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
    clickText(text: string): void {
      fireEvent.click(screen.getByText(text));
    },
    changeLabeledInput(label: string, value: string): void {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    },
  };
}
