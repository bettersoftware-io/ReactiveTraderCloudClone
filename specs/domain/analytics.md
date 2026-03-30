# Analytics

This specification defines the entities and business rules for the analytics domain — real-time position tracking and profit & loss (P&L) reporting.

## Entities

### CurrencyPairPosition

Represents the current trading position for a single currency pair.

| Field               | Type   | Description                                      |
| ------------------- | ------ | ------------------------------------------------ |
| symbol              | string | Currency pair, e.g. "EURUSD"                     |
| basePnl             | number | Profit/loss in base (reporting) currency         |
| baseTradedAmount    | number | Net amount traded in base currency               |
| counterTradedAmount | number | Net amount traded in counter/terms currency      |

### HistoricPosition

A single point in the P&L time series.

| Field     | Type    | Description                          |
| --------- | ------- | ------------------------------------ |
| timestamp | string  | ISO timestamp of the data point      |
| usdPnl    | number  | Cumulative P&L in USD at this moment |

### PositionUpdates

The response shape from the analytics service.

| Field            | Type                       | Description                           |
| ---------------- | -------------------------- | ------------------------------------- |
| currentPositions | array of CurrencyPairPosition | One entry per pair with open positions |
| history          | array of HistoricPosition  | Time-series P&L for charting          |

## Business Rules

### Reporting Currency

All analytics are calculated in USD. The analytics service is always called with `currency = "USD"`.

### Position Aggregation

- Positions are aggregated per currency pair
- `basePnl` represents unrealized P&L based on current market prices
- `baseTradedAmount` is the net position in base currency (negative = short, positive = long)
- `counterTradedAmount` is the corresponding counter-currency exposure

### P&L History

- History is a chronological time series of cumulative P&L snapshots
- Used to render the P&L line chart
- In mock mode: 90 data points at 10-second intervals
- In production: driven by the analytics service stream

### Display Rules

#### Last P&L Value
- Positive values: displayed with buy/positive color (green)
- Negative values: displayed with sell/negative color (red)
- Format: numerical with sign prefix (+/-) and thousands separators

#### Position Bubbles
- One bubble per unique currency (not per pair)
- Currencies derived from all currency pair symbols: EUR, USD, GBP, JPY, AUD, NZD, CAD
- Bubble size proportional to absolute position magnitude
- Tooltip shows: "{CURRENCY} {formatted amount}"
- Bubbles are draggable (visual only, no data effect)

#### P&L Per Currency Pair
- One bar/entry per currency pair
- Display format: "BASE/TERMS" (e.g., "EUR/USD")
- Values use abbreviated notation (k, m for thousands/millions)
- Stale data indicator shown when analytics data hasn't refreshed after reconnection
