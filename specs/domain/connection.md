# Connection Domain

Manages the lifecycle of the client's connection to the trading gateway, including automatic reconnection, idle detection, and offline handling.

## Connection Status (enum)

| Value | Description |
|---|---|
| `CONNECTING` | Establishing a connection to the gateway (includes reconnection attempts). |
| `CONNECTED` | Active, healthy connection to the gateway. Data is flowing. |
| `DISCONNECTED` | Connection lost due to a gateway error or unexpected disconnect. Auto-reconnect will be attempted. |
| `IDLE_DISCONNECTED` | Client intentionally disconnected after prolonged user inactivity. No auto-reconnect; requires user interaction. |
| `OFFLINE_DISCONNECTED` | Browser/device lost network connectivity. Reconnection begins automatically when the network is restored. |

## State Machine

```
                  +------------------+
                  |   CONNECTING     |<--------------------------+
                  +------------------+                           |
                         |                                       |
            gateway connected                                    |
                         |                                       |
                         v                                       |
                  +------------------+                           |
          +------>|   CONNECTED      |                           |
          |       +------------------+                           |
          |         |       |       |                            |
          |         |       |       |                            |
          |   gateway    no mouse   browser                     |
          |   disconnects movement  goes                        |
          |   or error   for 15min  offline                     |
          |         |       |       |                            |
          |         v       v       v                            |
          |  +--------+ +-------+ +----------+                  |
          |  |DISCONN.| | IDLE  | | OFFLINE  |                  |
          |  |        | | DISC. | | DISC.    |                  |
          |  +--------+ +-------+ +----------+                  |
          |      |          |           |                        |
          |  auto-reconnect mouse move/ browser                 |
          |  after 10s     click       comes online             |
          |      |          |           |                        |
          |      +----------+-----------+------------------------+
          |
          +--- (from OFFLINE: browser comes online and
                gateway was still connected -- restore CONNECTED)
```

### Transition Table

| From | To | Trigger | Notes |
|---|---|---|---|
| `CONNECTING` | `CONNECTED` | Gateway reports connected | -- |
| `CONNECTED` | `DISCONNECTED` | Gateway reports disconnected or error | Hydra RECONNECTING maps to CONNECTING; ERROR maps to DISCONNECTED. |
| `CONNECTED` | `IDLE_DISCONNECTED` | No mouse movement for 15 minutes | Client actively closes the gateway connection. |
| `CONNECTED` | `OFFLINE_DISCONNECTED` | Browser fires offline event | -- |
| `DISCONNECTED` | `CONNECTING` | Auto-reconnect fires after 10 seconds | Handled by gateway configuration, not application logic. |
| `IDLE_DISCONNECTED` | `CONNECTING` | User moves mouse or clicks reconnect | Application re-initializes the gateway connection. |
| `OFFLINE_DISCONNECTED` | `CONNECTING` | Browser fires online event | Application restores the last known gateway status. |

### Guard: IDLE Takes Precedence Over DISCONNECTED

When the connection is in `IDLE_DISCONNECTED` and the gateway subsequently reports `DISCONNECTED` (because the idle handler just closed the connection), the state must remain `IDLE_DISCONNECTED`. This prevents the auto-reconnect path (`DISCONNECTED -> CONNECTING`) from triggering, which would defeat the purpose of idle disconnection.

**Rule:** If current state is `IDLE_DISCONNECTED` and incoming event is `DISCONNECTED`, discard the event.

## Connection Configuration

| Parameter | Value | Notes |
|---|---|---|
| Gateway URL | Configurable via environment variable | Different per deployment environment. |
| Auto-reconnect | Enabled | Gateway handles reconnection internally. |
| Reconnect interval | 10,000 ms (10 seconds) | Fixed interval, not exponential backoff. |
| Wire format | JSON in development, binary (SBE) in production | Switched by build mode, not at runtime. |
| Idle timeout | 15 minutes | Measured from the last `mousemove` event on the document. |

## Idle Disconnection Rules

1. The idle timer starts (or restarts) on every `mousemove` event on the document.
2. The idle timer also restarts when a new connection is established (to handle reconnection without subsequent mouse movement).
3. The idle timer only runs while the connection is in `CONNECTING` or `CONNECTED` state.
4. When the timer fires, the client closes the gateway connection and transitions to `IDLE_DISCONNECTED`.
5. Any `mousemove` event while in `IDLE_DISCONNECTED` triggers a new connection attempt (transition to `CONNECTING`).

## Offline/Online Detection

1. On page load, the current network state is read (online or offline).
2. The browser's `online` and `offline` window events are monitored continuously.
3. When the browser goes offline and the connection is active (`CONNECTING` or `CONNECTED`), transition to `OFFLINE_DISCONNECTED`.
4. When the browser comes back online, restore the latest known gateway connection status. If the gateway is still connected, the status becomes `CONNECTED` directly.

**Caveat:** Browser network detection only covers device-level connectivity. The device may be connected to a local network but have no internet access; in that case, the offline event will not fire (false positive for connectivity).

## Gateway Status Mapping

The gateway may report its own set of statuses. These must be mapped to the application connection statuses:

| Gateway Status | Application Status |
|---|---|
| CONNECTING | `CONNECTING` |
| RECONNECTING | `CONNECTING` |
| CONNECTED | `CONNECTED` |
| DISCONNECTED | `DISCONNECTED` |
| ERROR | `DISCONNECTED` |

## Stale Data Detection

After a reconnection, any data received before the reconnection is considered stale. Stale data must be visually distinguished in the UI (e.g., greyed out, loading indicator) until fresh data arrives.

### Detection Algorithm

1. Track the timestamp of the most recent `CONNECTED` transition (the "connection timestamp").
2. For each data stream, track the timestamp of the last received message (the "data timestamp").
3. Data is stale when: `data_timestamp < connection_timestamp`.
4. Once a new message arrives on the stream after reconnection, `data_timestamp >= connection_timestamp`, and the stale flag clears.
5. Before any data has been received on a stream, it is always considered stale (data timestamp initialized to 0).

### Stale Data Rules

1. Each data stream is evaluated for staleness independently.
2. Stale detection is only meaningful when the connection is `CONNECTED`.
3. The UI should show a loading/fallback state for any component whose underlying data stream is stale.

## Mock Mode

When mock mode is enabled (via environment configuration):

1. The connection status is always `CONNECTED`.
2. No gateway connection is established.
3. Idle detection, offline detection, and reconnection logic are all bypassed.
4. All service data is provided by the mock backend instead of the gateway.

## Connection-Gated Data Streams

Data subscriptions should only emit values while the connection is `CONNECTED`. When the connection is in any other state, data streams are paused (no emissions). This ensures components do not process data during unstable connection states and naturally triggers stale detection on reconnection.
