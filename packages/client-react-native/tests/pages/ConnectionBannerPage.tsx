// packages/client-react-native/tests/pages/ConnectionBannerPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";

import type { ConnectionStatus } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

interface StyleEntryWithBackground {
  backgroundColor: ViewStyle["backgroundColor"];
}

function hasBackgroundColor(entry: unknown): entry is StyleEntryWithBackground {
  return (
    entry !== null && typeof entry === "object" && "backgroundColor" in entry
  );
}

function fakeViewModel(
  status: ConnectionStatus,
  reconnect: () => void,
): ViewModel {
  return {
    useConnectionStatus: () => {
      return status;
    },
    useReconnect: () => {
      return reconnect;
    },
  } as unknown as ViewModel;
}

export interface ConnectionBannerPage {
  mount(status: ConnectionStatus, reconnect?: () => void): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  pressText(text: string): Promise<void>;
  /** The dot's rendered style is `[staticDotStyle, { backgroundColor }]`;
   * finds the dynamic backgroundColor entry regardless of array position. */
  dotColor(): ViewStyle["backgroundColor"];
}

/** The framework surface for `ConnectionBanner.test.tsx`. */
export function connectionBannerPage(): ConnectionBannerPage {
  return {
    async mount(
      status: ConnectionStatus,
      reconnect: () => void = () => {
        return undefined;
      },
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(status, reconnect)}>
          <ConnectionBanner />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    async pressText(text: string): Promise<void> {
      await fireEvent.press(screen.getByText(text));
    },
    dotColor(): ViewStyle["backgroundColor"] {
      const style = screen.getByTestId("connection-dot").props.style as unknown;
      const styles = Array.isArray(style) ? style : [style];
      return styles.find(hasBackgroundColor)?.backgroundColor;
    },
  };
}
