export const enum ConnectionStatus {
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  IDLE_DISCONNECTED = "IDLE_DISCONNECTED",
  OFFLINE_DISCONNECTED = "OFFLINE_DISCONNECTED",
}

export const IDLE_TIMEOUT_MS = 15 * 60 * 1_000; // 15 minutes
export const RECONNECT_INTERVAL_MS = 10_000; // 10 seconds

export type ConnectionEvent =
  | { type: "gatewayConnected" }
  | { type: "gatewayDisconnected" }
  | { type: "reconnectAttempt" }
  | { type: "idleTimeout" }
  | { type: "userActivity" }
  | { type: "browserOffline" }
  | { type: "browserOnline" };

/**
 * Pure state machine transition function for connection status.
 * Returns the new state, or the same state if the event is ignored.
 */
export function nextConnectionStatus(
  current: ConnectionStatus,
  event: ConnectionEvent,
): ConnectionStatus {
  switch (current) {
    case ConnectionStatus.CONNECTING:
      switch (event.type) {
        case "gatewayConnected":
          return ConnectionStatus.CONNECTED;
        case "gatewayDisconnected":
          return ConnectionStatus.DISCONNECTED;
        case "browserOffline":
          return ConnectionStatus.OFFLINE_DISCONNECTED;
        default:
          return current;
      }

    case ConnectionStatus.CONNECTED:
      switch (event.type) {
        case "gatewayDisconnected":
          return ConnectionStatus.DISCONNECTED;
        case "idleTimeout":
          return ConnectionStatus.IDLE_DISCONNECTED;
        case "browserOffline":
          return ConnectionStatus.OFFLINE_DISCONNECTED;
        default:
          return current;
      }

    case ConnectionStatus.DISCONNECTED:
      switch (event.type) {
        // A reconnect attempt (fired by the transport every RECONNECT_INTERVAL_MS)
        // moves back to CONNECTING; success then yields gatewayConnected -> CONNECTED,
        // failure yields gatewayDisconnected -> DISCONNECTED and the cycle repeats.
        case "reconnectAttempt":
          return ConnectionStatus.CONNECTING;
        case "gatewayConnected":
          return ConnectionStatus.CONNECTED;
        case "browserOffline":
          return ConnectionStatus.OFFLINE_DISCONNECTED;
        default:
          return current;
      }

    case ConnectionStatus.IDLE_DISCONNECTED:
      // Guard: ignore gatewayDisconnected (idle takes precedence)
      switch (event.type) {
        case "userActivity":
          return ConnectionStatus.CONNECTING;
        case "browserOffline":
          return ConnectionStatus.OFFLINE_DISCONNECTED;
        default:
          return current;
      }

    case ConnectionStatus.OFFLINE_DISCONNECTED:
      switch (event.type) {
        case "browserOnline":
          return ConnectionStatus.CONNECTING;
        default:
          return current;
      }
  }
}

export type GatewayStatus = "CONNECTING" | "RECONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR";

export function mapGatewayStatus(gateway: GatewayStatus): ConnectionStatus.CONNECTING | ConnectionStatus.CONNECTED | ConnectionStatus.DISCONNECTED {
  switch (gateway) {
    case "CONNECTING":
    case "RECONNECTING":
      return ConnectionStatus.CONNECTING;
    case "CONNECTED":
      return ConnectionStatus.CONNECTED;
    case "DISCONNECTED":
    case "ERROR":
      return ConnectionStatus.DISCONNECTED;
  }
}
