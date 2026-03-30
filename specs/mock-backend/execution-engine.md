# Execution Engine

Trade execution simulation with deterministic per-pair behavior.

## Trade IDs

Trade IDs are auto-incrementing integers starting at **1**. Each new execution (regardless of outcome) receives the next sequential ID.

## Execution Rules by Currency Pair

| Currency Pair | Status | Response Delay |
|--------------|--------|---------------|
| GBPJPY | **Rejected** | Random 0-2,000ms |
| EURJPY | **Done** (delayed) | Fixed 4,000ms |
| All others | **Done** (success) | Random 0-2,000ms |

### Delay Formulas

- **Normal and Rejected pairs**: `Math.random() * 2_000` milliseconds
- **EURJPY**: Fixed `4_000` milliseconds

### Additional Client-Side Delay

The Tile state layer adds an extra delay on top of the mock execution delay:

```
Math.random() * 1000 + 100
```

This means total observed delay for EURJPY is approximately **4,100ms to 5,100ms**, which does not exceed the production client timeout of 30,000ms. To trigger actual timeout behavior in E2E tests, a specific test configuration would be needed.

## Response Shape

### Done / Rejected

```json
{
  "...executionRequest properties",
  "tradeId": "<auto-increment>",
  "status": "Done | Rejected",
  "valueDate": "<current date>",
  "tradeDate": "<current date>"
}
```

The response spreads all properties from the original execution request and adds the trade metadata fields.

### Timeout (Client-Side)

Timeouts are determined client-side when the response takes longer than the configured threshold:

```json
{
  "...executionRequest properties",
  "status": "Timeout"
}
```

## Side Effects

- Trades with status **Done** are published to the executions stream
- The blotter / trade store picks up these executions and adds them to the trade list
- **Rejected** trades are also added to the trade store (they appear in the blotter)
- **Timeout** trades are handled client-side only and do not enter the trade store
