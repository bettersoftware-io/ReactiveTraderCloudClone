# Credit Reference Data

Static bond instrument and dealer definitions for the credit trading module.

## Delivery

### Instruments

- Emitted as a flat list (single snapshot)
- No incremental updates in mock mode
- The snapshot represents the full state of the world for credit instruments

### Dealers

- Emitted one dealer at a time (streamed individually)
- Client accumulates dealers into a list as they arrive
- There is **no "Adaptive Bank"** in the mock dealer data; Adaptive Bank is only present in the production service
- Sell-side functionality depends on "Adaptive Bank" being in the dealer list, so it is not exercisable against the mock backend

## Instruments (11 bonds)

| ID | Name | CUSIP | Ticker | Maturity | Coupon Rate | Benchmark |
|----|------|-------|--------|----------|-------------|-----------|
| 0 | ORCL 4.755 08/15/2026 | 68389X105 | ORCL | 20250815 | 4.755 | 5Y UST 1.500 08/2026 |
| 1 | AAPL 4.111 01/12/2024 | 037833100 | AAPL | 20240112 | 4.111 | 2Y UST 2.250 01/2024 |
| 2 | GOOGL 5.001 01/01/2024 | 38259P508 | GOOGL | 20240101 | 5.001 | 2Y UST 2.500 01/2024 |
| 3 | MSFT 4.111 10/10/2024 | 594918104 | MSFT | 20241010 | 4.111 | 2Y UST 1.500 10/2024 |
| 4 | AMZN 5.122 06/15/2028 | 023135106 | AMZN | 20280615 | 5.122 | 7Y UST 1.250 06/2028 |
| 5 | BRK 3.755 09/01/2024 | 084670702 | BRK | 20240901 | 3.755 | 2Y UST 2.125 09/2024 |
| 6 | FB 5.550 10/15/2023 | 30303M102 | FB | 20231015 | 5.550 | 2Y UST 2.875 10/2023 |
| 7 | WMT 4.470 01/07/2024 | 931142103 | WMT | 20240107 | 4.470 | 2Y UST 2.750 02/2024 |
| 8 | XOM 5.001 04/01/2024 | 30231G102 | XOM | 20240401 | 5.001 | 2Y UST 2.250 05/2024 |
| 9 | PFE 4.850 07/01/2024 | 717081103 | PFE | 20240701 | 4.850 | 2Y UST 2.125 08/2024 |
| 10 | KO 2.957 08/27/2025 | 191216CN8 | KO | 20250827 | 2.957 | 3Y UST 2.875 08/2025 |

## Dealers (10 dealers)

| ID | Name |
|----|------|
| 0 | J.P. Morgan |
| 1 | Wells Fargo |
| 2 | Bank of America |
| 3 | Morgan Stanley |
| 4 | Goldman Sachs |
| 5 | Citigroup |
| 6 | TD Bank |
| 7 | UBS |
| 8 | Bank of New York Mellon |
| 9 | Capital One |

## Notes

- **Maturity** is stored as a numeric date in `YYYYMMDD` format.
- **Coupon Rate** is expressed as a percentage (e.g., 4.755 means 4.755%).
- **Benchmark** identifies the U.S. Treasury security used as the reference rate for spread calculations.
- The instrument **Name** follows the convention: `TICKER couponRate MM/DD/YYYY`.
- **CUSIP** is used as the unique security identifier in trade records and blotter display.
