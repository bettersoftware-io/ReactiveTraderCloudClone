// packages/client-react-native/tests/pages/SurfaceCardPage.tsx
import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SurfaceCard, type SurfaceCardProps } from "#/ui/SurfaceCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

export interface SurfaceCardPage {
  mount(
    variant: SurfaceCardProps["variant"],
    testID: string,
    theme?: RnTheme,
  ): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `SurfaceCard.test.tsx`. */
export function surfaceCardPage(): SurfaceCardPage {
  return {
    async mount(
      variant: SurfaceCardProps["variant"],
      testID: string,
      theme?: RnTheme,
    ): Promise<void> {
      await renderWithTheme(
        <SurfaceCard variant={variant} testID={testID}>
          <Text>x</Text>
        </SurfaceCard>,
        theme,
      );
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
