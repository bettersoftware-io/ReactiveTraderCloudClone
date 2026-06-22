import { ConnectionOverlay } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

afterEach(() => cleanupMounted());

describe("ConnectionOverlay", () => {
  it("shows no overlay while connected", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.message()).toBeNull();
  });

  it("shows no overlay while connecting", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTING },
    });
    expect(overlay.isVisible()).toBe(false);
  });

  it("blocks the UI with a reconnect message when disconnected", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.DISCONNECTED },
    });
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.message()).toMatch(/reconnecting/i);
  });

  it("explains an idle disconnect", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.message()).toMatch(/inactivity/i);
  });

  it("explains an offline disconnect", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
    });
    expect(overlay.message()).toMatch(/offline/i);
  });

  it("appears on a live connection drop and clears on recovery", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(overlay.isVisible()).toBe(false);
    overlay.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    expect(overlay.isVisible()).toBe(true);
    overlay.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(overlay.isVisible()).toBe(false);
  });
});
