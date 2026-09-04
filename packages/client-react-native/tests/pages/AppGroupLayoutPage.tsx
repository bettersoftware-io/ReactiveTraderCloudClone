// packages/client-react-native/tests/pages/AppGroupLayoutPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";

import AppGroupLayout from "#app/(app)/_layout";

export interface AppGroupLayoutPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `app/(app)/_layout.test.tsx` (the app-group
 * layout). Relies on the spec's own `jest.mock` of
 * `@react-native-async-storage/async-storage` and `#/ui/theme/fonts`,
 * hoisted above every import in the spec file. A plain static top-level
 * import of `AppGroupLayout` is safe here (unlike `BlotterModulePage` and
 * its siblings): neither mocked factory closes over anything declared later
 * in the spec, so there is no TDZ ordering trap to defer around. */
export function appGroupLayoutPage(): AppGroupLayoutPage {
  return {
    async mount(): Promise<void> {
      await render(<AppGroupLayout />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
