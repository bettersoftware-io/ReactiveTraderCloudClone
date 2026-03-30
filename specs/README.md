# Behavioral Specification Suite

Behavioral specs for recreating the ReactiveTraderCloud FX/Credit trading platform with a clean architecture and any technology stack.

## Scope

- **In scope:** Web/PWA application, FX trading domain, Credit trading domain, real-time streaming, blotter, analytics.
- **Out of scope:** NLP intent detection, OpenFin/Finsemble/Workspace platform integrations.

## Directory Structure

```
specs/
  domain/           Domain model specs (entities, state machines, business rules)
  services/         Service contract specs (RPCs, subscriptions, message schemas)
  features/         Feature specs in Gherkin (user-facing behavior)
  mock-backend/     Mock backend simulation specs (price engines, trade execution)
```

## Format Conventions

### `domain/` -- Structured Markdown

Each file defines one bounded context. Contents include:

- **Entity tables** listing fields, types, and constraints.
- **State machines** with named states, transitions, and guards.
- **Business rules** as numbered, testable statements.

### `services/` -- YAML Service Contracts

Each file defines one backend service with its RPCs and streaming subscriptions, including request/response message schemas. These are stack-agnostic; they describe _what_ crosses the wire, not _how_.

### `features/` -- Gherkin `.feature` Files

Standard Given/When/Then scenarios describing user-visible behavior. Scenarios reference domain terms and service contracts by name but contain no implementation detail.

### `mock-backend/` -- Simulation Specs (Markdown)

Describes algorithms for generating realistic mock data: price movement models, trade execution latency, rejection logic, and credit RFQ lifecycle timing. An implementation of these specs replaces the real backend for development and testing.

## How Layers Reference Each Other

```
features/  ---uses terms from--->  domain/
features/  ---assumes data from->  services/
services/  ---messages typed by->  domain/
mock-backend/  --implements--->    services/
```

- **Features** describe behavior in terms of domain entities (e.g., "a Currency Pair tile shows a bid and ask price").
- **Services** define the data contracts that features depend on; message fields reference domain entity definitions.
- **Mock backend** implements the service contracts with simulated data, following the simulation specs.

## Glossary

| Term | Definition |
|---|---|
| **Currency Pair** | Two currencies quoted against each other (e.g., EUR/USD). The first is the base currency, the second is the terms (quote) currency. |
| **Notional** | The face amount of a trade, denominated in the base currency. |
| **Spread** | The difference between bid and ask prices, measured in pips. |
| **Pips** | The smallest standard price increment for a currency pair. Typically the 4th decimal place (or 2nd for JPY pairs). |
| **Bid** | The price at which the dealer will buy the base currency (client sells). |
| **Ask** | The price at which the dealer will sell the base currency (client buys). |
| **Mid** | The midpoint between bid and ask. |
| **Tile** | A UI component showing live pricing for a single currency pair, with buy/sell buttons. |
| **Blotter** | A table of executed trades with filtering, sorting, and export capabilities. |
| **RFQ** | Request for Quote. In Credit trading, the client requests a price from the dealer before executing. |
| **Quote** | A dealer's response to an RFQ, containing a price and expiry time. |
| **SoW (State of the World)** | The initial snapshot of all current data sent when a subscription is first established or after reconnection. Incremental updates follow. |
| **Stale Data** | Data received before the most recent reconnection. Stale data should be visually indicated until fresh data arrives. |
