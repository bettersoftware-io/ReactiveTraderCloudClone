# FX Trading Domain Model

Stack-agnostic domain model for FX trading entities in Reactive Trader Cloud.

---

## Entities

### CurrencyPair

Represents a tradeable foreign exchange instrument.

| Field | Type | Description |
|-------|------|-------------|
| symbol | string | Concatenated pair code, e.g. "EURUSD" |
| ratePrecision | integer | Number of decimal places for rate display (e.g., 5 for EURUSD, 3 for USDJPY) |
| pipsPosition | integer | Position of the pip digit from the right (e.g., 4 for EURUSD, 2 for USDJPY) |
| base | string | First 3 characters of symbol (e.g., "EUR") -- the base currency |
| terms | string | Last 3 characters of symbol (e.g., "USD") -- the terms/quote currency |
| defaultNotional | number | Default trade size for this pair |

#### Known Currency Pairs

| Symbol | RatePrecision | PipsPosition | DefaultNotional |
|--------|---------------|--------------|-----------------|
| EURUSD | 5 | 4 | 1,000,000 |
| USDJPY | 3 | 2 | 1,000,000 |
| GBPUSD | 5 | 4 | 1,000,000 |
| GBPJPY | 3 | 2 | 1,000,000 |
| EURJPY | 3 | 2 | 1,000,000 |
| AUDUSD | 5 | 4 | 1,000,000 |
| NZDUSD | 5 | 4 | 10,000,000 |
| EURCAD | 5 | 4 | 1,000,000 |
| EURAUD | 5 | 4 | 1,000,000 |

### PriceTick

A raw price update received from the pricing backend.

| Field | Type | Description |
|-------|------|-------------|
| symbol | string | Currency pair symbol |
| bid | number | Best bid price |
| ask | number | Best ask price |
| mid | number | Mid-market price |
| valueDate | date | Settlement date |
| creationTimestamp | integer | Tick timestamp (epoch) |

### Price

An enriched price derived from a PriceTick, augmented with display-ready fields.

Includes all fields from PriceTick, plus:

| Field | Type | Description |
|-------|------|-------------|
| movementType | PriceMovementType | Direction of price change relative to previous tick |
| spread | string | Formatted bid-ask spread in pips |

---

## Enums

### PriceMovementType

Indicates the direction of price movement between consecutive ticks.

- **UP** -- current mid > previous mid
- **DOWN** -- current mid < previous mid
- **NONE** -- first tick only (no previous value to compare)

After the first tick, movement is always either UP or DOWN. When the current mid equals the previous mid, the movement defaults to DOWN.

---

## Business Rules

### Spread Calculation

The spread represents the difference between ask and bid prices, expressed in pips.

**Formula:**

```
spread = (ask - bid) * 10^pipsPosition
```

The result is formatted to `ratePrecision - pipsPosition` decimal places.

**Example -- EURUSD** (ratePrecision=5, pipsPosition=4):

- ask = 1.53834, bid = 1.53816
- spread = (1.53834 - 1.53816) * 10^4 = 1.8
- Decimal places = 5 - 4 = 1
- Formatted result: "1.8"

**Example -- USDJPY** (ratePrecision=3, pipsPosition=2):

- ask = 110.523, bid = 110.501
- spread = (110.523 - 110.501) * 10^2 = 2.2
- Decimal places = 3 - 2 = 1
- Formatted result: "2.2"

### Price Movement Detection

Movement is determined by comparing the current tick's `mid` value with the previous tick's `mid`:

1. The first tick received for a symbol always has movement = NONE.
2. For all subsequent ticks:
   - mid > previous mid: **UP**
   - mid <= previous mid: **DOWN** (equal values default to DOWN)

### Price History

A rolling window of recent price ticks used for historical chart display.

- **Initial load:** The last 50 ticks from the price history endpoint.
- **Rolling updates:** Each new tick is appended; when the window exceeds 50 entries, the oldest is dropped.
- **Window size:** 50 ticks maximum.

### Currency Filters

Tiles can be filtered by currency. A pair matches a filter if its 6-character symbol contains the 3-character currency code anywhere in the string (i.e., either as base or terms).

| Filter | Matching Pairs |
|--------|---------------|
| All | All 9 pairs |
| EUR | EURUSD, EURJPY, EURCAD, EURAUD (4 pairs) |
| USD | EURUSD, USDJPY, GBPUSD, AUDUSD, NZDUSD (5 pairs) |
| GBP | GBPUSD, GBPJPY (2 pairs) |
| AUD | AUDUSD, EURAUD (2 pairs) |
| NZD | NZDUSD (1 pair) |
| JPY | USDJPY, GBPJPY, EURJPY (3 pairs) |
| CAD | EURCAD (1 pair) |

### Notional Input Rules

The notional field controls the trade size on each tile.

- **Default value:** Sourced from `CurrencyPair.defaultNotional` for the given symbol.
- **Shortcut multipliers:**
  - Trailing "k" (case-insensitive) multiplies the numeric value by 1,000.
  - Trailing "m" (case-insensitive) multiplies the numeric value by 1,000,000.
- **Maximum allowed:** 1,000,000,000. Values above this threshold display a "Max exceeded" error and the trade cannot be submitted.
- **RFQ threshold:** When the notional value is >= 10,000,000, the tile enters Request for Quote (RFQ) mode. See [fx-execution.md](fx-execution.md) for RFQ workflow details.
- **Reset:** The notional resets to the default value after a trade execution completes. Users can also manually reset via a reset control when the value differs from the default.

### CurrencyPair Collection Updates

Currency pairs are managed as a collection that supports incremental updates:

- **Initial load:** A state-of-the-world snapshot containing all active pairs (update type "Added").
- **Incremental updates:** Individual pairs can be added or removed.
  - **Added/Updated:** Upserts the pair into the active set.
  - **Removed:** Deletes the pair from the active set by symbol.
- **Derived fields:** `base` and `terms` are derived from the first and last 3 characters of `symbol`, respectively. `defaultNotional` is assigned based on the symbol (NZDUSD defaults to 10,000,000; all others default to 1,000,000).
