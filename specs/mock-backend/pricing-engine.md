# Pricing Engine

Price generation algorithm for all FX currency pairs.

## Initialization

For each currency pair, generate a random initial mid price:

```
mid = Math.trunc(Math.random() * 1_000_000) / 100_000
```

This produces values in the range 0 to approximately 9.99999.

The fixed half-spread is **0.0002**:

```
ask = mid + 0.0002
bid = mid - 0.0002
```

## Price History Generation

On startup, generate **50 initial price ticks** using the random walk formula below. Each tick contains:

| Field | Type | Description |
|-------|------|-------------|
| ask | number | Mid + half-spread |
| bid | number | Mid - half-spread |
| mid | number | Current mid price |
| creationTimestamp | number | Epoch milliseconds |
| symbol | string | Currency pair symbol (e.g. "EURUSD") |
| valueDate | string | Current date in YYYY-MM-DD format |

## Price Movement (Random Walk)

After each tick, the mid price is updated:

```
mid = mid * (1 + (Math.random() > 0.5 ? 0.0001 : -0.0001))
```

This produces a +/-0.01% random walk per tick. The ask and bid are then recalculated from the new mid using the same +/-0.0002 half-spread.

## Tick Interval

The delay between ticks is randomized:

```
interval = Math.max(150, Math.random() * 1000)
```

Each tick fires between **150ms and 1000ms** after the previous one.

## Price Stream Behavior

1. On subscription, emit the initial **50-tick history** as an array
2. Schedule recurring price generation at random intervals
3. Each subsequent emission is the full **50-tick rolling window** (oldest tick dropped, newest tick appended)
4. The **current price** is always the last element of the array (index 49)
5. **Historical prices** are elements 0 through 48

## FX RFQ Quote Generation

When an RFQ (Request for Quote) is requested for a symbol:

### Price Calculation

1. Take the current live price for the symbol
2. Calculate a price change based on the pair's pips position:
   ```
   priceChange = 0.3 / 10^pipsPosition
   ```
3. Widen the spread:
   ```
   rfqAsk = currentAsk + priceChange
   rfqBid = currentBid - priceChange
   ```

### Timing

- **Response delay**: 500ms + random(0-500ms), so between **500ms and 1000ms**
- **Quote timeout**: **10,000ms** (10 seconds) from quote delivery

### Response Shape

The RFQ quote response includes:

- Notional amount from the request
- Currency pair information
- Adjusted ask and bid prices (wider than live spread)
- Current timestamp
- Timeout duration
