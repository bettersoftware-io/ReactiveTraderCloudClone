# Credit Trading Domain

## Instrument (Bond)

| Field        | Type    | Description         | Example                    |
| ------------ | ------- | ------------------- | -------------------------- |
| id           | integer | Unique ID           | 0                          |
| name         | string  | Full bond name      | "ORCL 4.755 08/15/2026"   |
| cusip        | string  | CUSIP identifier    | "68389X105"                |
| ticker       | string  | Issuer ticker       | "ORCL"                     |
| maturity     | date    | Bond maturity date  | "20250815" (YYYYMMDD)      |
| interestRate | number  | Coupon rate         | 4.755                      |
| benchmark    | string  | Reference benchmark | "5Y UST 1.500 08/2026"    |

## Dealer

| Field | Type    | Description      |
| ----- | ------- | ---------------- |
| id    | integer | Unique dealer ID |
| name  | string  | Dealer/bank name |

Special dealer: "Adaptive Bank" -- this is the user's own bank for sell-side functionality.

## RFQ (Request for Quote)

| Field             | Type      | Description                                                            |
| ----------------- | --------- | ---------------------------------------------------------------------- |
| id                | integer   | Unique RFQ ID                                                          |
| instrumentId      | integer   | Reference to Instrument                                                |
| quantity          | number    | Trade quantity (user-entered value x 1000 -- see quantity adjustment)   |
| direction         | Direction | Buy or Sell                                                            |
| state             | RfqState  | Current lifecycle state                                                |
| expirySecs        | integer   | Seconds until expiry                                                   |
| creationTimestamp | integer   | Epoch timestamp                                                        |

## RfqState (enum)

| Value     | Description                                  |
| --------- | -------------------------------------------- |
| Open      | RFQ is live, accepting quotes                |
| Expired   | Time ran out with no accepted quote          |
| Cancelled | User cancelled the RFQ                       |
| Closed    | A quote was accepted, trade completed        |

## Quote

| Field    | Type       | Description                    |
| -------- | ---------- | ------------------------------ |
| id       | integer    | Unique quote ID                |
| rfqId    | integer    | Reference to parent RFQ        |
| dealerId | integer    | Reference to quoting dealer    |
| state    | QuoteState | Current quote state            |

## QuoteState (discriminated union)

| Type                 | Payload        | Description                                                  |
| -------------------- | -------------- | ------------------------------------------------------------ |
| pendingWithoutPrice  | none           | Dealer assigned but hasn't responded                         |
| pendingWithPrice     | number (price) | Dealer submitted a price, awaiting decision                  |
| passed               | none           | Dealer declined to quote                                     |
| accepted             | number (price) | Quote was accepted                                           |
| rejectedWithPrice    | number (price) | Quote was rejected (another quote accepted or RFQ expired)   |
| rejectedWithoutPrice | none           | Quote was rejected before dealer submitted a price           |

## Quote State Transitions

```
pendingWithoutPrice -> pendingWithPrice      (dealer submits price via quoteQuoted)
pendingWithoutPrice -> passed                (dealer passes via quotePassed)
pendingWithoutPrice -> rejectedWithoutPrice  (another quote accepted while this one pending)
pendingWithPrice    -> accepted              (user accepts this quote via quoteAccepted)
pendingWithPrice    -> rejectedWithPrice     (another quote accepted, this one auto-rejected)
passed              -> passed                (terminal state)
```

When a quote is accepted:

- The accepted quote transitions to `accepted` state.
- All `pendingWithoutPrice` quotes auto-transition to `rejectedWithoutPrice`.
- All `pendingWithPrice` quotes auto-transition to `rejectedWithPrice`.
- Already `passed` quotes remain as `passed`.

## Quote Display States

| State                | Display Text                              |
| -------------------- | ----------------------------------------- |
| pendingWithoutPrice  | "Awaiting response"                       |
| rejectedWithoutPrice | "Awaiting response" (same display)        |
| passed               | "Passed" (hides after 6 seconds)          |
| pendingWithPrice     | "${price}" (formatted with dollar sign)   |
| accepted             | "${price}"                                |
| rejectedWithPrice    | "${price}"                                |

## Quantity Adjustment Rule

User-entered quantity is multiplied by 1,000 before sending to the server.

- User enters 100 -> server receives 100,000
- User enters 2,000 -> server receives 2,000,000
- Max input value: 100,000,000

## Credit Trade (derived from accepted RFQ)

| Field        | Type      | Description                |
| ------------ | --------- | -------------------------- |
| tradeId      | integer   | Same as RFQ ID             |
| status       | string    | Always "accepted"          |
| tradeDate    | date      | Date of acceptance         |
| direction    | Direction | Buy or Sell                |
| counterParty | string    | Dealer name                |
| cusip        | string    | Bond CUSIP                 |
| security     | string    | Bond ticker                |
| quantity     | number    | Trade quantity             |
| orderType    | string    | Always "AON" (All or Nothing) |
| unitPrice    | number    | Accepted quote price       |

## RFQ Update Events (streaming)

```
startOfStateOfTheWorld
rfqCreated        -> payload: RfqBody (new RFQ)
quoteCreated      -> payload: QuoteBody (dealer assigned to quote)
quoteQuoted       -> payload: QuoteBody (dealer submitted price)
quotePassed       -> payload: QuoteBody (dealer passed)
quoteAccepted     -> payload: QuoteBody (quote accepted)
rfqClosed         -> payload: RfqBody (RFQ closed)
endOfStateOfTheWorld
```
