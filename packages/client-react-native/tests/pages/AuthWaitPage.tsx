// packages/client-react-native/tests/pages/AuthWaitPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { type StyleProp, StyleSheet, Text, type ViewStyle } from "react-native";

import { HandshakeConsole } from "#/ui/shell/auth/wait/HandshakeConsole";
import { ReactorRings } from "#/ui/shell/auth/wait/ReactorRings";
import { ReactorWait } from "#/ui/shell/auth/wait/ReactorWait";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface AuthWaitPage {
  mountHandshake(): Promise<void>;
  mountReactorWait(): Promise<void>;
  /** Mounts the rings around a marker child (`emblem-marker`). */
  mountReactorRings(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  opacityOf(testId: string): number | undefined;
  /** The flattened `transform` of a node — `[]` when it sets none. */
  transformOf(testId: string): readonly object[];
}

/** The rings and the bar are decorative and hidden from assistive tech, which
 * RNTL's queries skip by default. */
const HIDDEN_TOO = { includeHiddenElements: true };

/** The framework surface for the three login-wait component specs. Each spec
 * mocks `useShellMotionEnabled` itself, hoisted above its imports. */
export function authWaitPage(): AuthWaitPage {
  async function mount(ui: ReactElement): Promise<void> {
    await renderWithTheme(ui);
  }

  function flatStyle(testId: string): ViewStyle | undefined {
    return StyleSheet.flatten(
      screen.getByTestId(testId, HIDDEN_TOO).props
        .style as StyleProp<ViewStyle>,
    );
  }

  return {
    mountHandshake(): Promise<void> {
      return mount(<HandshakeConsole />);
    },
    mountReactorWait(): Promise<void> {
      return mount(<ReactorWait />);
    },
    mountReactorRings(): Promise<void> {
      return mount(
        <ReactorRings>
          <Text testID="emblem-marker">emblem</Text>
        </ReactorRings>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId, HIDDEN_TOO) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    opacityOf(testId: string): number | undefined {
      return flatStyle(testId)?.opacity as number | undefined;
    },
    transformOf(testId: string): readonly object[] {
      return (flatStyle(testId)?.transform ?? []) as readonly object[];
    },
  };
}
