import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { ConnectionStatus } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("renders nothing when connected — the header dot carries that state", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(ConnectionStatus.CONNECTED)}>
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("connection-dot")).toBeNull();
  expect(screen.queryByText("LIVE")).toBeNull();
  expect(screen.queryByText("RECONNECT ▸")).toBeNull();
});

test("colours the status dot statusConnecting while connecting", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(ConnectionStatus.CONNECTING)}>
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(dotColor()).toBe(rnThemeTokens.holo.dark.statusConnecting);
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

test("shows CONNECTING… and hides RECONNECT while connecting", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(ConnectionStatus.CONNECTING)}>
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(screen.getByText("CONNECTING…")).toBeTruthy();
  expect(screen.queryByText("RECONNECT ▸")).toBeNull();
});

test("shows DISCONNECTED with a RECONNECT button that calls reconnect", async () => {
  const reconnect = jest.fn<() => void>();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(ConnectionStatus.DISCONNECTED, reconnect)}
    >
      <ConnectionBanner />
    </ViewModelProvider>,
  );
  expect(screen.getByText("DISCONNECTED")).toBeTruthy();
  await fireEvent.press(screen.getByText("RECONNECT ▸"));
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
