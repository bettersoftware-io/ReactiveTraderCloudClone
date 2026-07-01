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

  it("overlay tracks only useConnectionStatus: stays for re-emitted IDLE, clears on CONNECTING", () => {
    // The overlay is stateless w.r.t. user activity — it has no userActivity
    // wiring and reacts solely to useConnectionStatus. So the only way the idle
    // overlay can dismiss is a real status change driven by the app layer.
    // (Button-only recovery itself — userActivity never reconnecting — is
    // enforced and tested at the app/domain layer: connectionStatus.test.ts and
    // idleTeardown.test.ts. This UI test only pins the overlay's status-tracking.)
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.isVisible()).toBe(true);
    // Re-emitting the same idle status must not dismiss the overlay.
    overlay.emit({ useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED });
    expect(overlay.isVisible()).toBe(true);
    // Recovery: the app layer pushes CONNECTING after a reconnect intent.
    overlay.emit({ useConnectionStatus: ConnectionStatus.CONNECTING });
    expect(overlay.isVisible()).toBe(false);
  });
});
