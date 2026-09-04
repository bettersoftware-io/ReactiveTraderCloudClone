// packages/client-react-native/tests/pages/RootLayoutPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";

import RootLayout from "#app/_layout";

export interface RootLayoutPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `app/_layout.test.tsx` (the minimal expo-router
 * root). Relies on the spec's own `jest.mock("expo-router", ...)`, hoisted
 * above every import in the spec file. A plain static top-level import of
 * `RootLayout` is safe here (unlike `BlotterModulePage` and its siblings):
 * the mocked factory closes over nothing declared later in the spec, so
 * there is no TDZ ordering trap to defer around. */
export function rootLayoutPage(): RootLayoutPage {
  return {
    async mount(): Promise<void> {
      await render(<RootLayout />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
