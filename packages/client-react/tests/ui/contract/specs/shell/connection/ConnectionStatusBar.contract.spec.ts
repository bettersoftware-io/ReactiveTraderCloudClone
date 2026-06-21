import { ConnectionStatus } from "@rtc/domain";
import { ConnectionStatusBar } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("ConnectionStatusBar", () => {
  it("labels a connecting session", () => {
    expect(
      mount(ConnectionStatusBar, {
        hooks: { useConnectionStatus: ConnectionStatus.CONNECTING },
      }).statusText(),
    ).toBe("Connecting...");
  });

  it("labels a connected session", () => {
    expect(
      mount(ConnectionStatusBar, {
        hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
      }).statusText(),
    ).toBe("Connected");
  });

  it("labels a disconnected session", () => {
    expect(
      mount(ConnectionStatusBar, {
        hooks: { useConnectionStatus: ConnectionStatus.DISCONNECTED },
      }).statusText(),
    ).toBe("Disconnected");
  });

  it("labels an idle session", () => {
    expect(
      mount(ConnectionStatusBar, {
        hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
      }).statusText(),
    ).toBe("Idle");
  });

  it("labels an offline session", () => {
    expect(
      mount(ConnectionStatusBar, {
        hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
      }).statusText(),
    ).toBe("Offline");
  });

  it("reflects a live connection drop", () => {
    const bar = mount(ConnectionStatusBar, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(bar.statusText()).toBe("Connected");
    bar.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    expect(bar.statusText()).toBe("Disconnected");
  });
});
