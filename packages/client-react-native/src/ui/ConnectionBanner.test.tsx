import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { ConnectionStatus } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

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
