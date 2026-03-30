# Reference Data

Static currency pair definitions delivered as a single snapshot.

## Delivery

- Emitted as a single array after a **1-second simulated delay**
- No incremental updates in mock mode
- The snapshot represents the full state of the world for currency pairs

## Currency Pairs

| Symbol | Rate Precision | Pips Position | Base | Terms | Default Notional |
|--------|---------------|---------------|------|-------|-----------------|
| EURUSD | 5 | 4 | EUR | USD | 1,000,000 |
| USDJPY | 3 | 2 | USD | JPY | 1,000,000 |
| GBPUSD | 5 | 4 | GBP | USD | 1,000,000 |
| GBPJPY | 3 | 2 | GBP | JPY | 1,000,000 |
| EURJPY | 3 | 2 | EUR | JPY | 1,000,000 |
| AUDUSD | 5 | 4 | AUD | USD | 1,000,000 |
| NZDUSD | 5 | 4 | NZD | USD | 10,000,000 |
| EURCAD | 5 | 4 | EUR | CAD | 1,000,000 |
| EURAUD | 5 | 4 | EUR | AUD | 1,000,000 |

## Notes

- **NZDUSD** has a default notional of **10,000,000**, which causes it to start in RFQ (Request for Quote) mode by default. All other pairs use 1,000,000.
- **Rate Precision** controls how many decimal places are displayed for prices.
- **Pips Position** indicates which decimal place represents one pip (used for spread calculations and price formatting).
