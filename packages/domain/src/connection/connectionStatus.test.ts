import { describe, it, expect } from "vitest";
import { ConnectionStatus, nextConnectionStatus, mapGatewayStatus } from "./connectionStatus.js";
import type { ConnectionEvent } from "./connectionStatus.js";

describe("nextConnectionStatus", () => {
  it("CONNECTING -> CONNECTED on gatewayConnected", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTING, { type: "gatewayConnected" }),
    ).toBe(ConnectionStatus.CONNECTED);
  });

  it("CONNECTING -> DISCONNECTED on gatewayDisconnected (boot-time server-down)", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTING, { type: "gatewayDisconnected" }),
    ).toBe(ConnectionStatus.DISCONNECTED);
  });

  it("CONNECTED -> DISCONNECTED on gatewayDisconnected", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTED, { type: "gatewayDisconnected" }),
    ).toBe(ConnectionStatus.DISCONNECTED);
  });

  it("CONNECTED -> IDLE_DISCONNECTED on idleTimeout", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTED, { type: "idleTimeout" }),
    ).toBe(ConnectionStatus.IDLE_DISCONNECTED);
  });

  it("CONNECTED -> OFFLINE_DISCONNECTED on browserOffline", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTED, { type: "browserOffline" }),
    ).toBe(ConnectionStatus.OFFLINE_DISCONNECTED);
  });

  it("CONNECTING -> OFFLINE_DISCONNECTED on browserOffline", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTING, { type: "browserOffline" }),
    ).toBe(ConnectionStatus.OFFLINE_DISCONNECTED);
  });

  it("IDLE_DISCONNECTED ignores gatewayDisconnected (idle takes precedence)", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.IDLE_DISCONNECTED, { type: "gatewayDisconnected" }),
    ).toBe(ConnectionStatus.IDLE_DISCONNECTED);
  });

  it("IDLE_DISCONNECTED -> CONNECTING on userActivity", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.IDLE_DISCONNECTED, { type: "userActivity" }),
    ).toBe(ConnectionStatus.CONNECTING);
  });

  it("OFFLINE_DISCONNECTED -> CONNECTING on browserOnline", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.OFFLINE_DISCONNECTED, { type: "browserOnline" }),
    ).toBe(ConnectionStatus.CONNECTING);
  });

  it("DISCONNECTED -> CONNECTED on gatewayConnected (reconnect)", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.DISCONNECTED, { type: "gatewayConnected" }),
    ).toBe(ConnectionStatus.CONNECTED);
  });

  it("DISCONNECTED -> CONNECTING on reconnectAttempt", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.DISCONNECTED, { type: "reconnectAttempt" }),
    ).toBe(ConnectionStatus.CONNECTING);
  });

  it("ignores reconnectAttempt outside DISCONNECTED", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTED, { type: "reconnectAttempt" }),
    ).toBe(ConnectionStatus.CONNECTED);
    expect(
      nextConnectionStatus(ConnectionStatus.OFFLINE_DISCONNECTED, { type: "reconnectAttempt" }),
    ).toBe(ConnectionStatus.OFFLINE_DISCONNECTED);
  });

  it("ignores irrelevant events", () => {
    expect(
      nextConnectionStatus(ConnectionStatus.CONNECTING, { type: "idleTimeout" }),
    ).toBe(ConnectionStatus.CONNECTING);
    expect(
      nextConnectionStatus(ConnectionStatus.OFFLINE_DISCONNECTED, { type: "userActivity" }),
    ).toBe(ConnectionStatus.OFFLINE_DISCONNECTED);
  });
});

describe("mapGatewayStatus", () => {
  it("maps CONNECTING to CONNECTING", () => {
    expect(mapGatewayStatus("CONNECTING")).toBe(ConnectionStatus.CONNECTING);
  });

  it("maps RECONNECTING to CONNECTING", () => {
    expect(mapGatewayStatus("RECONNECTING")).toBe(ConnectionStatus.CONNECTING);
  });

  it("maps CONNECTED to CONNECTED", () => {
    expect(mapGatewayStatus("CONNECTED")).toBe(ConnectionStatus.CONNECTED);
  });

  it("maps DISCONNECTED to DISCONNECTED", () => {
    expect(mapGatewayStatus("DISCONNECTED")).toBe(ConnectionStatus.DISCONNECTED);
  });

  it("maps ERROR to DISCONNECTED", () => {
    expect(mapGatewayStatus("ERROR")).toBe(ConnectionStatus.DISCONNECTED);
  });
});
