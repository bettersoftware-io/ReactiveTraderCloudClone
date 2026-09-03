// packages/client-react-native/tests/pages/AppearanceButtonPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import { AppearanceButton } from "#/ui/shell/appearance/AppearanceButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface AppearanceButtonPage {
  mount(onPress: () => void): Promise<void>;
  unmountAll(): Promise<void>;
  press(): Promise<void>;
}

/** The framework surface for `AppearanceButton.test.tsx`. */
export function appearanceButtonPage(): AppearanceButtonPage {
  return {
    async mount(onPress: () => void): Promise<void> {
      await renderWithTheme(<AppearanceButton onPress={onPress} />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    async press(): Promise<void> {
      await fireEvent.press(screen.getByTestId("appearance-button"));
    },
  };
}
