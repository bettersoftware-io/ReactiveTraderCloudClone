# Service Protocol

This specification defines the communication patterns between client and server, including subscription lifecycle, data delivery, and connection management.

## State-of-the-World (SoW) Pattern

All streaming subscriptions follow a common pattern to ensure the client always has a complete, consistent view of the data:

1. Client subscribes to a service stream.
2. Server sends the complete current state as an initial payload.
3. Server sends incremental updates as they occur.
4. On reconnection, the full SoW is re-sent.

There are two variants of SoW delivery.

### Variant A: Bulk SoW

Used by: BlotterService, ReferenceDataService, AnalyticsService.

The server sends the entire current state in a single message, then follows with incremental updates.

**Initial payload (SoW):**

```
{
  updates: [ ...all current items... ],
  isStateOfTheWorld: true,
  isStale: false
}
```

**Incremental update:**

```
{
  updates: [ ...changed items only... ],
  isStateOfTheWorld: false,
  isStale: false
}
```

**Processing rules:**

- When `isStateOfTheWorld` is `true`, replace the entire local collection with the contents of `updates`.
- When `isStateOfTheWorld` is `false`, merge the `updates` into the existing local collection (typically keyed by entity ID).

### Variant B: Marker-based SoW

Used by: WorkflowService, InstrumentService, DealerService.

The server sends individual items bracketed by start/end markers, then follows with typed event messages.

**SoW sequence:**

```
{ type: "startOfStateOfTheWorld" }
{ type: "added", payload: item1 }
{ type: "added", payload: item2 }
...
{ type: "endOfStateOfTheWorld" }
```

**Incremental updates (after SoW):**

```
{ type: "added", payload: newItem }
{ type: "removed", payload: itemId }
{ type: "rfqCreated", payload: ... }
```

**Processing rules:**

- On receiving `startOfStateOfTheWorld`, clear the local collection.
- Accumulate all `added` messages until `endOfStateOfTheWorld` is received.
- After `endOfStateOfTheWorld`, process subsequent messages as incremental updates.

## Collection Update Types

Entity collections (currency pairs, instruments, dealers) use the following update types:

| Type    | Payload          | Meaning                        |
| ------- | ---------------- | ------------------------------ |
| added   | Full entity      | Entity added to the collection |
| removed | Entity ID only   | Entity removed from the collection |

## RFQ Update Types

The credit RFQ stream uses marker-based SoW (Variant B) and defines the following update types:

| Type                    | Payload        | Description                                     |
| ----------------------- | -------------- | ----------------------------------------------- |
| startOfStateOfTheWorld  | (none)         | Marks the beginning of the SoW sequence         |
| endOfStateOfTheWorld    | (none)         | Marks the end of the SoW sequence               |
| rfqCreated              | RFQ entity     | A new RFQ has been created                      |
| quoteCreated            | Quote entity   | A dealer has been assigned to quote (no price yet) |
| quoteQuoted             | Quote entity   | A dealer has submitted a price                  |
| quotePassed             | Quote entity   | A dealer has passed (declined to quote)         |
| quoteAccepted           | Quote entity   | A quote has been accepted                       |
| rfqClosed               | RFQ entity     | The RFQ has been closed                         |

### RFQ Lifecycle

```
rfqCreated
    |
    +---> quoteCreated (one per dealer)
    |         |
    |         +---> quoteQuoted   (dealer submitted price)
    |         +---> quotePassed   (dealer declined)
    |
    +---> quoteAccepted (one quote selected)
    |
    +---> rfqClosed
```

## Request-Response Pattern

RPCs (remote procedure calls) follow a simple request-response model:

1. Client sends a typed request message.
2. Server sends a single typed response message.
3. The client correlates request and response.

### Ack/Nack Responses

Mutation operations return an acknowledgement:

**Success (Ack):**

```
{ type: "ack" }
```

**Success with payload:**

```
{ type: "ack", payload: <value> }
```

Example: CreateRfq returns `{ type: "ack", payload: rfqId }`.

**Failure (Nack):**

```
{ type: "nack" }
```

## Stale Data

Staleness indicates that the client has reconnected but has not yet received fresh data for a given subscription.

### Rules

- A Bulk SoW message with `isStale: true` means the server has not yet received upstream data after reconnection.
- Clients must display a stale or loading indicator when `isStale` is `true`.
- Staleness resolves when a subsequent message arrives with `isStale: false` and a timestamp after the connection was established.
- During staleness, the client should retain and display the last known data (if any) alongside the stale indicator, rather than clearing the display.

## Connection Lifecycle

The full lifecycle of a client session:

```
1. Connect          Establish connection to gateway (URL is configurable)
       |
2. Subscribe        Subscribe to desired service streams
       |
3. Receive SoW      Receive State-of-the-World for each subscription
       |
4. Process Updates   Process incremental updates as they arrive
       |
   (connection lost)
       |
5. Disconnected     Display disconnected state to user
       |
6. Auto-Reconnect   Automatically attempt to re-establish connection
       |
7. Re-Subscribe     Re-subscribe to all previously active streams
       |
8. Fresh SoW        Receive new SoW for each subscription
       |
9. Staleness Check  Compare timestamps to detect stale data
       |
       +---> Return to step 4
```

### Disconnection Behavior

- The client must detect connection loss and display a disconnected indicator.
- Reconnection is automatic; the user does not need to take action.
- All active subscriptions are re-established on reconnection.
- The client must not assume data continuity across reconnections. The fresh SoW replaces any previously held state.

### Subscription Management

- Each subscription is independent. Subscribing to one service does not affect others.
- Subscriptions may be added or removed at any time during an active connection.
- Unsubscribing from a stream stops incremental updates for that stream. The client may discard or retain the last known data at its discretion.
