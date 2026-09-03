import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { StateTabProps } from "#/timeline/StateTab";
import { StateTab } from "#/timeline/StateTab";

export interface StateTabPage {
  mountStateTab(props: StateTabProps): void;
  unmountAll(): void;
  hasText(text: string): boolean;
  hasPlaceholder(text: string): boolean;
  testIdCount(testId: string): number;
  changeSearch(placeholder: string, value: string): void;
}

/** The framework surface for `StateTab.test.tsx`. */
export function stateTabPage(): StateTabPage {
  return {
    mountStateTab(props: StateTabProps): void {
      render(<StateTab {...props} />);
    },
    unmountAll(): void {
      cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasPlaceholder(text: string): boolean {
      return screen.queryByPlaceholderText(text) != null;
    },
    testIdCount(testId: string): number {
      return screen.queryAllByTestId(testId).length;
    },
    changeSearch(placeholder: string, value: string): void {
      fireEvent.change(screen.getByPlaceholderText(placeholder), {
        target: { value },
      });
    },
  };
}
