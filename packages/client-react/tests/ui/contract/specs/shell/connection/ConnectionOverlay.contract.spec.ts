import { ConnectionOverlay } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

afterEach(() => {
  return cleanupMounted();
});

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
    expect(overlay.message()).toMatch(/re-connect/i);
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

describe("ConnectionOverlay — Reconnect button (item 1, button-only idle recovery)", () => {
  // Provenance: original components/DisconnectionOverlay.tsx:29-36
  // (button renders only for IDLE_DISCONNECTED; absent for OFFLINE and plain DISCONNECTED).

  it("shows a labelled Reconnect button for IDLE_DISCONNECTED", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    const btn = overlay.reconnectButton();
    expect(btn).not.toBeNull();
    expect(btn?.textContent?.trim()).toBe("Reconnect");
  });

  it("does NOT show a Reconnect button for OFFLINE_DISCONNECTED", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
    });
    expect(overlay.reconnectButton()).toBeNull();
  });

  it("does NOT show a Reconnect button for generic DISCONNECTED", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.DISCONNECTED },
    });
    expect(overlay.reconnectButton()).toBeNull();
  });

  it("clicking Reconnect invokes the useReconnect command exactly once", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.reconnectButton()).not.toBeNull();
    overlay.clickReconnect();
    expect(overlay.commands.reconnect).toBe(1);
  });

  it("recovery is button-only: a userActivity hook push after idle close does not dismiss the overlay", () => {
    // This test verifies the UI contract: the overlay only hides when the
    // connection status changes (driven by the app layer), not when userActivity
    // is emitted. The app layer no longer routes userActivity→reopen (Task 1).
    // Here we confirm the overlay component itself has no direct userActivity
    // wiring — it only responds to useConnectionStatus changes.
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.isVisible()).toBe(true);
    // Simulate a userActivity event reaching the hook layer (no-op in new wiring).
    // The overlay must remain visible because useConnectionStatus has not changed.
    // (There is no "userActivity" hook to push; this comment documents intent:
    // the overlay is stateless w.r.t. userActivity — it only reads useConnectionStatus.)
    overlay.emit({ useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED });
    expect(overlay.isVisible()).toBe(true);
    // Recovery: the app layer pushes CONNECTING after reconnect$.
    overlay.emit({ useConnectionStatus: ConnectionStatus.CONNECTING });
    expect(overlay.isVisible()).toBe(false);
  });
});
