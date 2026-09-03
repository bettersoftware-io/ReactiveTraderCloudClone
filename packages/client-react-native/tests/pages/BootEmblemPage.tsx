// packages/client-react-native/tests/pages/BootEmblemPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface BootEmblemPage {
  mount(isFreeze: boolean): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
}

/** The two seams `useBootMotionEnabled` reads. `isFreeze` is the one that
 * matters here; `forceBootAnimation` stays off so Freeze is decisive. */
function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
    useForceBootAnimation: () => {
      return { enabled: false };
    },
  } as unknown as ViewModel;
}

/** The framework surface for `BootEmblem.test.tsx`. */
export function bootEmblemPage(): BootEmblemPage {
  return {
    async mount(isFreeze: boolean): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(isFreeze)}>
          <BootEmblem />
        </ViewModelProvider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
