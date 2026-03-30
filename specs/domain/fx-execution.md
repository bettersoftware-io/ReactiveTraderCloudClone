# FX Trade Execution

This specification defines the behavioral rules for FX spot trade execution, including entity definitions, state machines, and display requirements.

## Entities

### Trade

| Field        | Type        | Description                       |
| ------------ | ----------- | --------------------------------- |
| tradeId      | integer     | Unique trade identifier           |
| tradeName    | string      | Trader name                       |
| currencyPair | string      | e.g. "EURUSD"                     |
| notional     | number      | Trade size                        |
| dealtCurrency| string      | Currency being bought/sold        |
| direction    | Direction   | Buy or Sell                       |
| spotRate     | number      | Execution rate                    |
| status       | TradeStatus | Pending, Done, or Rejected        |
| tradeDate    | date        | When the trade was executed        |
| valueDate    | date        | Settlement date                   |

### Direction

| Value | Meaning                          |
| ----- | -------------------------------- |
| Buy   | Buying base currency             |
| Sell  | Selling base currency            |

### TradeStatus

| Value    | Meaning                                                  |
| -------- | -------------------------------------------------------- |
| Pending  | Trade submitted, awaiting response (transient; should not appear in blotter) |
| Done     | Trade executed successfully                              |
| Rejected | Trade rejected by server                                 |

### ExecutionStatus

Client-side enum representing the outcome of a trade submission.

| Value          | Meaning                                            |
| -------------- | -------------------------------------------------- |
| Done           | Server confirmed execution                         |
| Rejected       | Server rejected the trade                          |
| Timeout        | No server response within 30 seconds               |
| CreditExceeded | Trade blocked by limit checker before reaching server |

### ExecutionRequest

| Field        | Type      | Description                                             |
| ------------ | --------- | ------------------------------------------------------- |
| currencyPair | string    | e.g. "EURUSD"                                           |
| spotRate     | number    | Price at time of click (ask for Buy, bid for Sell)      |
| direction    | Direction | Buy or Sell                                             |
| notional     | number    | Trade size                                              |
| dealtCurrency| string    | Derived from direction (see Dealt Currency Rule below)  |

## Dealt Currency Rule

The dealt currency depends on the trade direction:

- **Buy**: dealtCurrency = base currency (first 3 characters of the symbol)
- **Sell**: dealtCurrency = terms currency (last 3 characters of the symbol)

Example for EURUSD:

| Direction | Dealt Currency |
| --------- | -------------- |
| Buy       | EUR            |
| Sell      | USD            |

## Tile State Machine

A tile represents a single currency pair and manages the lifecycle of trade execution for that pair.

### States

| State          | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| Ready          | Idle. Displaying live prices. Accepting trade submissions.     |
| Started        | Trade submitted. Awaiting server response.                     |
| TooLong        | Execution taking longer than 2 seconds. Warning displayed.     |
| Finished       | Execution complete. Trade object available. Showing confirmation. |
| Timeout        | No response received within 30 seconds.                        |
| CreditExceeded | Limit checker blocked the trade before it reached the server.  |

### Transitions

```
            +-------+
            | Ready |<-------------------------------------------+
            +-------+                                            |
                |                                                |
          user clicks                                   5s or dismiss
          Buy or Sell                                            |
                |                                                |
                v                                                |
          +---------+                                            |
          | Started |                                            |
          +---------+                                            |
           |   |   |                                             |
           |   |   +--- server responds (Done/Rejected) ------->+--- Finished
           |   |                                                 |
           |   +-------- 30s elapsed --------------------------->+--- Timeout
           |                                                     |
           +--- 2s elapsed ---> +---------+                      |
                                | TooLong |                      |
                                +---------+                      |
                                 |       |                       |
                                 |       +-- 30s elapsed ------->+--- Timeout
                                 |                               |
                                 +-- server responds ----------->+--- Finished
                                                                 |
          +----------------+                                     |
          | CreditExceeded |-- 5s or dismiss --->----------------+
          +----------------+
                ^
                |
          limit checker rejects (from Started)
```

### Timing Constants

| Constant                    | Value     | Description                               |
| --------------------------- | --------- | ----------------------------------------- |
| Too Long warning threshold  | 2,000 ms  | Time before showing "taking longer than usual" |
| Execution timeout           | 30,000 ms | Maximum wait before declaring timeout     |
| Confirmation auto-dismiss   | 5,000 ms  | Time before returning to Ready state      |
| Simulated execution delay   | 100-1,100 ms | Mock backend random delay (testing only) |

### Confirmation Display

The confirmation overlay shown in Finished, Timeout, and CreditExceeded states:

| ExecutionStatus | Background | Message                                               |
| --------------- | ---------- | ----------------------------------------------------- |
| Done            | Green      | "You Bought/Sold" with trade details (rate, notional, pair) |
| Rejected        | Red        | "Your trade has been rejected"                        |
| Timeout         | Orange     | Timeout message                                       |
| CreditExceeded  | Warning    | Credit limit exceeded message                         |

## RFQ State Machine (FX)

Request for Quote is triggered when the notional meets or exceeds the RFQ threshold. When active, the tile switches from streaming prices to a fixed quote workflow.

### Threshold

- RFQ is required when notional >= **10,000,000**

### States

| State     | Description                                                      |
| --------- | ---------------------------------------------------------------- |
| Init      | Normal tile mode. No RFQ active. Streaming prices shown.         |
| Requested | RFQ sent to server. Awaiting quote.                              |
| Received  | Quote received. Showing fixed bid/ask with countdown timer.      |
| Rejected  | Quote expired (timer ran out) or user explicitly rejected quote. |

### Transitions

```
          +------+
          | Init |<----------------------------------------------+
          +------+                                               |
              |                                                  |
        user clicks                                        2s delay
        "Initiate RFQ"                                          |
              |                                           +----------+
              v                                           | Rejected |
        +-----------+                                     +----------+
        | Requested |                                          ^
        +-----------+                                          |
          |       |                                  timer expires or
          |       +--- user cancels ---> Init        user clicks reject
          |                                                    |
          +--- server responds -----> +----------+             |
               with quote             | Received |-------------+
                                      +----------+
                                           |
                                      user clicks
                                      Buy or Sell
                                           |
                                           v
                                    Init + trigger trade execution
```

### Key Rules

1. **Threshold**: RFQ button appears only when notional >= 10,000,000.
2. **Quote timeout**: The server response includes a timeout field that determines how long the quote remains valid.
3. **Reject display**: After rejection, the Rejected state is shown for 2,000 ms before returning to Init.
4. **Duplicate prevention**: While in Requested state, additional RFQ requests are ignored. Only one outstanding RFQ per tile.
5. **Quote acceptance**: Accepting a quote transitions the RFQ state to Init and simultaneously triggers a trade execution using the quoted price.
6. **Cancellation**: The user may cancel an outstanding RFQ before a quote arrives, returning immediately to Init.
