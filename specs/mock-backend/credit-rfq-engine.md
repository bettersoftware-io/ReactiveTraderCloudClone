# Credit RFQ Engine

Simulates dealer quote responses when a credit RFQ is created in mock mode.

## Simulated Dealer Quote Responses

When a credit RFQ is created, the mock backend generates simulated dealer responses for each dealer selected in the RFQ.

### Response Decision (per dealer)

- **Skip "Adaptive Bank"**: The user's own dealer identity never auto-responds to RFQs
- **Random participation**: Each other dealer has a **70% chance** of responding (`Math.random() > 0.3`)
- Dealers that do not respond remain in `pendingWithoutPrice` state for the duration of the RFQ

### Response Timing

- Each responding dealer receives an **independent random delay** between **0 and 30,000 milliseconds**
- The delay window is defined by `DEALER_RFQ_RESPONSE_TIME_WINDOW_MILLIS = 30000`
- Responses arrive asynchronously and independently of each other

### Price Generation

Each responding dealer generates a price using the following formula:

```
priceChange = floor(Math.random() * 10)    // integer 0-9
direction   = Math.random() > 0.5 ? -1 : 1
price       = 100 + priceChange * direction
```

- **Baseline**: 100 (fixed)
- **Price change**: random integer from 0 to 9
- **Direction**: 50/50 chance of positive or negative
- **Resulting range**: approximately 91 to 109

### Response Mechanism

1. After the random delay elapses, the dealer submits a quote via the `quote` RPC
2. The RPC call includes the `quoteId` and the generated `price`
3. The quote is only submitted if the RFQ is still in **Open** state at the time of response
4. If the RFQ has been cancelled, expired, or closed before the dealer responds, the quote is silently dropped
5. Errors during quote submission are caught and logged to the console

## RFQ Expiry

The mock backend (CreditRfqSimulator — "simulator is the server", decision D1) schedules a
server-side expiry for every RFQ at creation time:

- After `expirySecs` seconds (default `CREDIT_RFQ_EXPIRY_SECONDS = 120`, rtc-original
  `CREDIT_RFQ_EXPIRY_SECONDS = 120`), the simulator flips an Open RFQ to **Expired** and emits
  `rfqClosed` with `payload.state = "Expired"`.
- The expiry is only applied if the RFQ is still in **Open** state at the time the timer fires; a
  cancelled or already-closed RFQ is silently skipped.
- Calling `dispose()` clears all pending expiry timeouts (same `pendingTimeouts` pool as dealer
  responses), so no expiry fires after the simulator is torn down.
- The **frontend countdown** (RfqCountdown / useRfqCountdown) is purely cosmetic: it derives
  remaining time from `creationTimestamp + totalMs`, ticks every 100 ms, and stops at 0. It does
  NOT drive state transitions — those come exclusively from the `rfqClosed` event emitted by the
  simulator (mirrors rtc-original CreditRfqTimer + creditRfqs.ts:102-112).

## Sequence of Events

1. Client creates RFQ via `createRfq` RPC with instrument, direction, quantity, dealer list, and expiry
2. Mock backend acknowledges the RFQ and assigns it an ID
3. For each selected dealer (excluding Adaptive Bank):
   - Roll random participation (70% chance)
   - If participating, schedule a quote response after a random delay (0-30s)
4. As each delay fires:
   - Check that the RFQ is still Open
   - Generate a random price
   - Submit the quote via the `quote` RPC
5. Client receives quote updates via the `WorkflowService` subscription and updates the UI
