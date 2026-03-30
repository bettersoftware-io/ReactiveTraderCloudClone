# Mock Backend Specification

## Purpose

A self-contained mock backend for Reactive Trader Cloud that enables frontend development and testing without requiring a real Hydra/Aeron trading server. It simulates all FX and Credit services with realistic but synthetic data.

## Design Goals

- **No external dependencies** -- runs entirely in the browser or test harness
- **Deterministic enough to test against** -- fixed currency pairs, predictable execution rules, static position data
- **Realistic timing** -- simulated network delays and price tick intervals that approximate production behavior
- **Drop-in replacement** -- the mock services conform to the same observable interfaces as the real service layer

## Service Specifications

Each mock service is described in its own specification file:

| File | Description |
|------|-------------|
| [reference-data.md](reference-data.md) | Static currency pair definitions (9 FX pairs) |
| [pricing-engine.md](pricing-engine.md) | Price generation algorithm, tick intervals, RFQ quotes |
| [execution-engine.md](execution-engine.md) | Trade execution simulation with per-pair behavior rules |
| [trade-store.md](trade-store.md) | Blotter / trade accumulation from execution stream |
| [analytics-engine.md](analytics-engine.md) | P&L history generation and static position data |

## Activation

The mock backend is activated when the application cannot connect to a real backend, or when explicitly configured for mock mode. In mock mode, each service module substitutes its real Hydra subscription with a local observable that follows the specification described in these files.
