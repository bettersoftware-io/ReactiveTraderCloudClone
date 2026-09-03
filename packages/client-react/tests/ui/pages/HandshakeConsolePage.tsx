import { cleanup, render, screen } from "@testing-library/react";

import { HandshakeConsole } from "#/ui/shell/auth/wait/HandshakeConsole";

export interface HandshakeConsolePage {
  mount(): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
  statusText(): string;
}

/** The framework surface for `HandshakeConsole.test.tsx`. */
export function handshakeConsolePage(): HandshakeConsolePage {
  return {
    mount(): void {
      render(<HandshakeConsole />);
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
    statusText(): string {
      return screen.getByRole("status").textContent ?? "";
    },
  };
}
