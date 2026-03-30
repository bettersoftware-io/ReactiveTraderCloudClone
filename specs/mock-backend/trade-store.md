# Trade Store

Blotter behavior in mock mode versus production.

## Mock Blotter Behavior

In mock mode, the trade store does **not** subscribe to the BlotterService. Instead:

1. Trades are accumulated from the **local executions stream**
2. Each executed trade (Done or Rejected) is added to an in-memory map keyed by `tradeId`
3. Trades are displayed in **reverse insertion order** (newest first)
4. **Initial state**: empty array (no pre-existing trades)

New trades appear in the blotter immediately after execution completes.

## Production Blotter Behavior (Reference)

The real backend uses a State-of-the-World (SoW) pattern:

1. On subscription, the server sends an initial SoW snapshot with all existing trades (`isStateOfTheWorld = true`)
2. Subsequent messages are incremental updates as new trades execute
3. On SoW receipt: replace the entire trade map
4. On incremental update: merge by `tradeId` into the existing map
5. Display order: reverse (newest first)

## Credit Trades (Mock)

- Pre-populated with a **static set of mock credit trades**
- Emitted once on subscription
- No incremental updates after the initial emission
