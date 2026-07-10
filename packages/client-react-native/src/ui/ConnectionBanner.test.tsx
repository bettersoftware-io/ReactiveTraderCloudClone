import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { ConnectionStatus } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("colours the status dot statusConnected when connected", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(ConnectionStatus.CONNECTED)}>
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(dotColor()).toBe(rnThemeTokens.holo.dark.statusConnected);
});

test("colours the status dot statusDisconnected when disconnected (not the connected green)", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(ConnectionStatus.DISCONNECTED)}>
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(dotColor()).toBe(rnThemeTokens.holo.dark.statusDisconnected);
  expect(dotColor()).not.toBe(rnThemeTokens.holo.dark.statusConnected);
});

test("shows Live and hides Reconnect when connected", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(ConnectionStatus.CONNECTED)}>
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(screen.getByText("Live")).toBeTruthy();
  expect(screen.queryByText("Reconnect")).toBeNull();
});

test("shows Connecting… and hides Reconnect while connecting", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(ConnectionStatus.CONNECTING)}>
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(screen.getByText("Connecting…")).toBeTruthy();
  expect(screen.queryByText("Reconnect")).toBeNull();
});

test("shows Disconnected with a Reconnect button that calls reconnect", async () => {
  const reconnect = jest.fn<() => void>();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(ConnectionStatus.DISCONNECTED, reconnect)}
    >
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(screen.getByText("Disconnected")).toBeTruthy();
  await fireEvent.press(screen.getByText("Reconnect"));
  expect(reconnect).toHaveBeenCalledTimes(1);
});

function fakeViewModel(
  status: ConnectionStatus,
  reconnect: () => void = () => {
    return undefined;
  },
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

interface StyleEntryWithBackground {
  backgroundColor: unknown;
}

function hasBackgroundColor(entry: unknown): entry is StyleEntryWithBackground {
  return (
    entry !== null && typeof entry === "object" && "backgroundColor" in entry
  );
}

/** The dot's rendered style is `[staticDotStyle, { backgroundColor }]`; find
 * the dynamic backgroundColor entry regardless of array position. */
function dotColor(): unknown {
  const style = screen.getByTestId("connection-dot").props.style as unknown;
  const styles = Array.isArray(style) ? style : [style];
  return styles.find(hasBackgroundColor)?.backgroundColor;
}
