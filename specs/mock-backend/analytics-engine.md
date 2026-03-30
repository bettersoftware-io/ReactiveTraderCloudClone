# Analytics Engine

P&L history generation and static position data.

## P&L History Generation

### Initialization

1. Generate a random initial value between **-5,000 and +5,000**
2. Generate **90 historical data points** working backwards from the current time
3. Time step between points: **10,000ms** (10 seconds)

Each data point:

```json
{
  "usPnl": "<current price value>",
  "timestamp": "<epoch milliseconds>"
}
```

### Random Walk Formula

For each historical point:

```
currentPrice *= 1 + (Math.random() - 0.5) / 100
```

This produces a +/-0.5% random walk per step.

### Array Order

Points are generated backwards in time but inserted at the front of the array (using `unshift`), so the final array is in **chronological order** (oldest first, newest last).

## P&L History Updates

- Every **10 seconds**, generate a new data point using the same random walk formula:
  ```
  newPnl = lastPrice * (1 + (Math.random() - 0.5) / 100)
  ```
- Append the new point to the end of the array
- Drop the oldest point from the front
- Maintains a **90-point rolling window** at all times

## Current Positions

Static position data for all 9 currency pairs. These values do **not** update based on new trade executions in mock mode.

| Symbol | basePnl | baseTradedAmount | counterTradedAmount |
|--------|---------|-----------------|-------------------|
| EURUSD | 564.97 | -2,000,000 | 2,726,570 |
| USDJPY | 1,382.31 | -1,000,000 | 102,144,000 |
| GBPUSD | -1,656.82 | -1,000,000 | 1,638,980 |
| GBPJPY | 0 | 0 | 0 |
| EURJPY | 0 | 0 | 0 |
| AUDUSD | 0 | 0 | 0 |
| NZDUSD | 0 | 0 | 0 |
| EURCAD | 0 | 0 | 0 |
| EURAUD | 0 | 0 | 0 |

Only EURUSD, USDJPY, and GBPUSD have non-zero positions. All other pairs show zero across all fields, representing no historical trading activity in the mock dataset.
