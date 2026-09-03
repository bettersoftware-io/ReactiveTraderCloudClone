import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ModalShell } from "#/ui/shell/modal/ModalShell";

interface ModalShellMount {
  onClose: ReturnType<typeof vi.fn>;
}

export interface ModalShellPage {
  mount(open: boolean): ModalShellMount;
  unmountAll(): void;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasDialog(name: string): boolean;
  click(testId: string): void;
}

/** The framework surface for `ModalShell.test.tsx`. */
export function modalShellPage(): ModalShellPage {
  return {
    mount(open: boolean): ModalShellMount {
      const onClose = vi.fn();

      render(
        <ModalShell
          open={open}
          title="TITLE"
          subtitle="SUB"
          footNote="NOTE"
          ariaLabel="Test dialog"
          closeAriaLabel="Close test dialog"
          rootTestid="shell-root"
          closeTestid="shell-close"
          doneTestid="shell-done"
          onClose={onClose}
        >
          <div data-testid="shell-child">content</div>
        </ModalShell>,
      );

      return { onClose };
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasDialog(name: string): boolean {
      return screen.queryByRole("dialog", { name }) != null;
    },
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
  };
}
