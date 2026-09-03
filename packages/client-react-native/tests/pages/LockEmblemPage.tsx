// packages/client-react-native/tests/pages/LockEmblemPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import { LockEmblem } from "#/ui/shell/lock/LockEmblem";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface LockEmblemPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `LockEmblem.test.tsx`. */
export function lockEmblemPage(): LockEmblemPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(<LockEmblem />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
