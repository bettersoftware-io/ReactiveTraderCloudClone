[◀ 14. Composition & Wiring](14-composition-and-wiring.md) · [Architecture Document](../architecture.md) · [16. Trailheads ▶](16-trailheads.md)

## 15. Flows

§§4–5 show what crosses the wire and which states a machine visits, message by message. This section walks the same five journeys end to end through the *code* — every hop through a real file and a real symbol, from a UI event or a server tick to the pixel or the wire. Read it as the companion to §13's static package map: §13 shows where the rooms are, §15 shows someone actually walking through the house.

### 15.1 Control Flow vs Imports vs Data Flow

Three different "directions" are easy to conflate in a codebase this layered, and each flow below draws on all three:

**Imports** are a compile-time fact, fixed by the dependency rule: `client-react` / `client-react-native` depend on `react-bindings`, which depends on `client-core`, which depends on `domain` and `shared` ([§6 Package Dependencies](06-package-dependencies.md)). This direction never reverses — it's enforced by `package.json` and the grep gates in [§12](12-architectural-gates.md), not by any runtime behaviour.

**Control flow** — who calls whom — mostly follows imports *inward*: a click handler in the UI calls a ViewModel hook (`useViewModel()`), which calls a machine intent or a presenter method, which constructs a domain use case, which calls a port method, which an adapter fulfils (a WS `rpc()`/`send()` or an in-process simulator call). This is a synchronous call chain even though most of the methods being called return `Observable`s — nothing has *happened* yet at the moment of the call; a subscription has merely been arranged.

**Data flow** is the reverse: once a port's `Observable` is subscribed, values travel *outward* — an adapter emits, a domain use case enriches or reduces it, a presenter multicasts it (`shareReplay`/`share`), a bindings hook re-renders on it, and the UI paints. So the same six layers are walked in opposite orders for control vs. data, and the diagrams below draw both: solid arrows for a command travelling in, dashed arrows for the resulting stream travelling back out.

```mermaid
flowchart TB
    subgraph imports["Imports — compile time, inward only, never reverses"]
        direction LR
        i1["UI"]:::ui --> i2["Bindings"]:::bridge --> i3["Core"]:::core --> i4["Domain / Shared"]:::domain
    end
    subgraph control["Control — a click or command, synchronous call chain, inward"]
        direction LR
        c1["UI event"]:::ui --> c2["Hook / intent"]:::bridge --> c3["Presenter / Machine"]:::core --> c4["Use Case → Port"]:::domain
    end
    subgraph data["Data — an Observable emission, the reverse chain, outward"]
        direction LR
        d1["Adapter emits"]:::domain --> d2["Use Case enriches"]:::domain --> d3["Presenter multicasts"]:::core --> d4["Hook re-renders UI"]:::bridge
    end

    classDef ui     fill:#1f6feb,stroke:#79c0ff,color:#ffffff
    classDef bridge fill:#8957e5,stroke:#d2a8ff,color:#ffffff
    classDef core   fill:#238636,stroke:#56d364,color:#ffffff
    classDef domain fill:#1f2d3d,stroke:#4493f8,color:#e6edf3
    style imports fill:transparent,stroke:#6e7681
    style control fill:transparent,stroke:#6e7681
    style data fill:transparent,stroke:#6e7681
```

**The highest-frequency flow — FX price streaming — is deliberately not repeated here.** [§7's animated treatment](07-communication-patterns.md#animated-the-life-of-a-price-tick) already walks that exact journey (`PricingSimulator` → `pricing$` effect → `WsAdapter` → `PricingPort` → `PriceStreamUseCase` → `PriceStreamPresenter.price$` → `usePrice()` → `Tile`), frame by frame, for both Mode A and Mode B; see also [§4.1](04-sequence-diagrams.md#41-fx-price-streaming). What follows are the five flows that stream doesn't cover: connecting, executing, quoting, ordering, and observing the system itself.

### 15.2 Connection Lifecycle — Gateway Up, Down, and Reconnect

The connection status shown in the header ([`ConnectionStatusBar.tsx`](../../packages/client-react/src/ui/shell/connection/ConnectionStatusBar.tsx), [`StatusBar.tsx`](../../packages/client-react/src/ui/shell/status/StatusBar.tsx)) and the blocking overlay ([`ConnectionOverlay.tsx`](../../packages/client-react/src/ui/shell/connection/ConnectionOverlay.tsx), or `ConnectionBanner.tsx` on RN) is a pure function of a merged event stream, not a raw socket read.

```mermaid
flowchart TB
    subgraph ui["UI — client-react / client-react-native"]
        direction LR
        bar["ConnectionStatusBar / StatusBar"]:::ui
        overlay["ConnectionOverlay<br/>Reconnect button"]:::ui
    end
    subgraph bindings["@rtc/react-bindings — createViewModel.ts"]
        direction LR
        hook["useConnectionStatus()"]:::bridge
        reconnectHook["useReconnect()"]:::bridge
    end
    subgraph core["@rtc/client-core"]
        direction LR
        pres["ConnectionStatusPresenter<br/>status$"]:::core
        cmd["commands.reconnect()<br/>reconnect$.next (composition.ts)"]:::core
        routeFn["routeIdleLifecycle()<br/>closeForIdle / reopen"]:::core
    end
    subgraph domain["@rtc/domain"]
        direction LR
        uc["ConnectionStatusUseCase<br/>scan(nextConnectionStatus, ...)"]:::domain
        port["ConnectionEventsPort"]:::domain
    end
    subgraph adapters["Adapters, merged per mode (buildBrowserPorts.ts)"]
        direction LR
        wsGateway["WsConnectionEventsAdapter<br/>+ WsAdapter onopen/onclose (Mode B)"]:::server
        browserAdapter["BrowserConnectionEventsAdapter<br/>idle timer, online/offline"]:::ui
        simGateway["ConnectionEventsSimulator (Mode A)"]:::domain
    end

    overlay -->|"1 click Reconnect"| reconnectHook -->|"2"| cmd -->|"3 reconnect event"| routeFn -->|"4 ws.reopen()"| wsGateway

    wsGateway -.->|"gatewayConnected / Disconnected"| port
    browserAdapter -.->|"idleTimeout / browserOnline/Offline"| port
    simGateway -.->|"same ConnectionEvent shape"| port
    port -.->|"5"| uc -.->|"6 status$"| pres -.->|"7"| hook -.->|"8 re-render"| bar
```

1. **Reconnect click** (idle-disconnected only): `ConnectionOverlay.tsx` calls `reconnect` from `useReconnect()`.
2. `useReconnect` resolves to `commands.reconnect` in `packages/client-core/src/composition.ts`.
3. `commands.reconnect()` pushes `{ type: "reconnect" }` onto the module-level `reconnect$` Subject (`composition.ts`).
4. `reconnect$` is merged into the `ConnectionEventsPort.events()` stream at the composition root (`buildBrowserPorts.ts`); the merged stream is piped through `routeIdleLifecycle()` (`composition.ts`), whose `tap` calls `ws.reopen()` on `WsAdapter` for a `reconnect` event (and `ws.closeForIdle()` for `idleTimeout`) — the one place a connection event has a *side effect* on the transport, not just a state transition.
5. Whichever adapter produced the event — `WsConnectionEventsAdapter` wrapping `WsAdapter`'s `onopen`/`onclose` handlers in Mode B, `BrowserConnectionEventsAdapter`'s idle timer and `online`/`offline` listeners (always active, both modes), or `ConnectionEventsSimulator` in Mode A — reaches `ConnectionStatusUseCase.execute()` (`packages/domain/src/usecases/ConnectionStatusUseCase.ts`) via the `ConnectionEventsPort`.
6. The use case `scan`s every event through the pure function `nextConnectionStatus()` (`packages/domain/src/connection/connectionStatus.ts`), producing the next `ConnectionStatus`.
7. `ConnectionStatusPresenter.status$` (`packages/client-core/src/presenters/ConnectionStatusPresenter.ts`) multicasts it with `shareReplay({ bufferSize: 1, refCount: true })`.
8. `useConnectionStatus()` (bound in `createViewModel.ts`) re-renders every subscribed component — the status bar, the overlay, `ConnectionBanner.tsx` on RN.

Same state machine at message level: [§5.1 Connection Status](05-state-diagrams.md#51-connection-status). The idle/offline wording split lives in `ConnectionOverlay.tsx`'s `overlayMessages` map, not in the domain layer — the domain only knows the five `ConnectionStatus` values.

### 15.3 FX Trade Execution — Click to Confirmation

```mermaid
flowchart TB
    subgraph ui["UI"]
        tile["Tile.tsx — Buy / Sell buttons"]:::ui
    end
    subgraph bindings["@rtc/react-bindings"]
        hook["useTileExecution(pair)<br/>useMachine(machines.tileExecution)"]:::bridge
    end
    subgraph core["@rtc/client-core"]
        machine["TileExecutionMachine<br/>intents.execute(direction, price, notional)"]:::core
        pres["TradeExecutionPresenter<br/>execute() · executions$"]:::core
    end
    subgraph domainL["@rtc/domain"]
        uc["ExecuteTradeUseCase<br/>derive spotRate + dealtCurrency"]:::domain
        port["ExecutionPort"]:::domain
    end
    subgraph adapters["Adapter, per mode (portFactory.ts)"]
        wsPort["createExecutionPort(ws)<br/>ws.rpc(EXECUTE_TRADE)"]:::server
        simPort["ExecutionSimulator (Mode A, in-process)"]:::domain
    end
    subgraph serverL["@rtc/server (Mode B only)"]
        effect["executeTrade$ effect<br/>rpc(EXECUTE_TRADE, EXECUTION_RESPONSE)"]:::server
        execSim["ExecutionSimulator (on server)<br/>0–2s delay · GBPJPY always rejects · EURJPY +4s"]:::domain
    end

    tile -->|"1"| hook -->|"2"| machine -->|"3"| pres -->|"4"| uc -->|"5"| port --> wsPort & simPort
    wsPort -->|"6 rpc"| effect --> execSim
    execSim -.->|"7 Trade"| effect -.-> wsPort
    wsPort -.->|"7"| port
    simPort -.->|"7"| port
    port -.->|"8"| uc -.->|"9 ExecuteTradeResult"| pres -.->|"10 executions$ + tap"| machine -.->|"11 finished state"| hook -.->|"12"| tile
```

1. `Tile.tsx` reads `useTileExecution` from `useViewModel()`; clicking Buy/Sell calls `tileExecution.intents.execute(direction, price, notional)`.
2. `useTileExecution(pair)` (`createViewModel.ts`) is a per-mount `useMachine(machines.tileExecution(pair))` — a fresh `TileExecutionMachine` per tile, auto-disposed on unmount.
3. `createTileExecutionMachine` (`packages/client-core/src/presenters/TileExecutionMachine.ts`) pushes the command onto its internal `execute$` Subject, which `switchMap`s into a lifecycle race: `started` → (`tooLong` at 2s / a result / `timeout` at 30s) → `finished`. The constants (`TOO_LONG_THRESHOLD_MS`, `EXECUTION_TIMEOUT_MS`, `CONFIRMATION_DISMISS_MS`) live in `@rtc/domain`.
4. The machine's `deps.execute` is wired in `composition.ts` to `TradeExecutionPresenter.execute()` (`packages/client-core/src/presenters/TradeExecutionPresenter.ts`).
5. `TradeExecutionPresenter.execute()` constructs `new ExecuteTradeUseCase(this.execution).execute(input)` (`packages/domain/src/usecases/ExecuteTradeUseCase.ts`), which derives `spotRate` from the tile's displayed bid/ask by `direction` and computes `dealtCurrency`, then calls `ExecutionPort.executeTrade(request)`.
6. In Mode B, `createExecutionPort(ws)` (`packages/client-core/src/adapters/portFactory.ts`) sends `CLIENT_MSG.EXECUTE_TRADE` via `ws.rpc(...)` with a correlation ID; the `executeTrade$` effect (`packages/server/src/effects/fx.effects.ts`, built with `rpc(CLIENT_MSG.EXECUTE_TRADE, SERVER_MSG.EXECUTION_RESPONSE, ...)`) calls `ctx.execution.executeTrade(...)` against the server-hosted `ExecutionSimulator` (`packages/domain/src/simulators/ExecutionSimulator.ts` — GBPJPY is always rejected, EURJPY carries an extra 4s delay, everything else resolves in 0–2s). In Mode A the same `ExecutionSimulator` class runs in-process, called directly.
7–9. The resolved `Trade` (or rejection) flows back through the port, and `ExecuteTradeUseCase` maps `TradeStatus.Rejected` to `ExecutionStatus.Rejected`, everything else to `Done`.
10. `TradeExecutionPresenter.execute()`'s `tap` also pushes an `ExecutionOutcome` onto its own `executions$` Subject (a side channel other tiles/the blotter can observe independently of this call's caller).
11. Back in the machine, the result collapses the race into `{ status: "finished", executionStatus, trade }`, then auto-dismisses to `ready` after `CONFIRMATION_DISMISS_MS` (5s).
12. `useTileExecution` re-renders `Tile.tsx` at every state transition — `started` → possibly `tooLong` → `finished` → back to `ready`.

Same message exchange, and the trade also landing in the blotter via a *separate* `TradeStoreSimulator` subscription: [§4.2 FX Trade Execution (RPC)](04-sequence-diagrams.md#42-fx-trade-execution-rpc). Same state machine: [§5.4 FX Trade Execution Flow](05-state-diagrams.md#54-fx-trade-execution-flow).

### 15.4 Credit RFQ — Request to Accepted Deal

The credit RFQ flow is the one with the richest state machine (§5.2, §5.3) and the widest fan-out (one RFQ, N dealer quotes, each independently timed) — the animated diagram below focuses on that fan-out and convergence, which a static diagram flattens.

```mermaid
flowchart TB
    subgraph ui["UI"]
        form["NewRfqPanel.tsx<br/>Send RFQ"]:::ui
        panel["RfqsPanel.tsx<br/>Accept / Cancel"]:::ui
        ticket["TradeTicket.tsx<br/>Quote price / Pass"]:::ui
    end
    subgraph bindings["@rtc/react-bindings"]
        subMachine["useRfqSubmission()<br/>useMachine(machines.rfqSubmission)"]:::bridge
        ticketMachine["useTicketSubmission()"]:::bridge
        acceptHook["useAcceptQuote() / useCancelRfq()"]:::bridge
        rfqsHook["useRfqs() / useQuotesForRfq()"]:::bridge
    end
    subgraph core["@rtc/client-core"]
        rfqsPres["RfqsPresenter<br/>createRfq · acceptQuote · quoteRfq · pass"]:::core
        subState["RfqsPresenter.createSubmission()<br/>editing → submitting → confirmed"]:::core
    end
    subgraph domainL["@rtc/domain"]
        createUc["CreateRfqUseCase"]:::domain
        eventsUc["WorkflowEventStreamUseCase<br/>scan(reduceRfqEvent)"]:::domain
        wport["WorkflowPort"]:::domain
    end
    subgraph adapters["Adapter (portFactory.ts)"]
        wsWorkflow["createWorkflowPort(ws)<br/>rpc CREATE_RFQ/ACCEPT/QUOTE/PASS · on WORKFLOW_EVENT"]:::server
    end
    subgraph serverL["@rtc/server (Mode B)"]
        effects["credit.effects.ts<br/>createRfq$ · accept$ · quote$ · pass$ · workflow$"]:::server
        rfqSim["CreditRfqSimulator + DealerSimulator<br/>0–30s per-dealer response, ~70% respond"]:::domain
    end

    form -->|"1 submit()"| subMachine -->|"2"| subState -->|"3 createRfq()"| createUc -->|"4"| wport --> wsWorkflow -->|"5 rpc"| effects -->|"6"| rfqSim
    ticket -->|"submitPrice / pass"| ticketMachine -->|"7 quoteRfq() / passQuote()"| rfqsPres --> wport
    panel -->|"Accept"| acceptHook -->|"8 acceptQuote()"| rfqsPres --> wport

    rfqSim -.->|"9 RfqEvent stream, per dealer"| effects -.->|"stream.workflowEvent"| wsWorkflow -.-> wport -.-> eventsUc -.->|"10 RfqStreamState"| rfqsPres -.-> rfqsHook -.->|"11"| panel
```

1. `NewRfqPanel.tsx` calls `submission.intents.submit(input, onRedirect)` from `useRfqSubmission()`.
2. `useRfqSubmission()` is a per-mount `useMachine(machines.rfqSubmission())`, wired in `composition.ts` to `presenters.rfqs.createSubmission()`.
3. `RfqsPresenter.createSubmission()` (`packages/client-core/src/presenters/RfqsPresenter.ts`) runs `editing → submitting`, then calls its own `createRfq(input)`.
4. `RfqsPresenter.createRfq()` constructs `new CreateRfqUseCase(this.workflow).execute(input)` (`packages/domain/src/usecases/CreateRfqUseCase.ts`), which calls `WorkflowPort.createRfq(request)`.
5. `createWorkflowPort(ws)` (`portFactory.ts`) sends `CLIENT_MSG.CREATE_RFQ` via `ws.rpc(...)`; the `createRfq$` rpc effect (`packages/server/src/effects/credit.effects.ts`) hands it to `CreditRfqSimulator`.
6. The simulator creates the `Rfq` (state `Open`) and, per selected dealer, a `Quote` (state `pendingWithoutPrice`), driven by `DealerSimulator`'s per-dealer response timing (0–30s, ~70% respond at all).
7. On the sell side, `TradeTicket.tsx` drives `useTicketSubmission()` → `RfqsPresenter.quoteRfq()`/`passQuote()` → the same `WorkflowPort`, `rpc(QUOTE)`/`rpc(PASS)`.
8. Accept/cancel/pass are **direct port pass-throughs with no dedicated use case** — `RfqsPresenter.acceptQuote(quoteId)` calls `this.workflow.accept(quoteId)` directly (mirrored in `RfqsPanel.tsx`'s `useAcceptQuote()`), matching the "accept/cancel/pass are direct port pass-throughs" note already called out in [§4.3](04-sequence-diagrams.md#43-credit-rfq-workflow).
9. Every `RfqEvent` the simulator emits (`quoteCreated`, `quoteQuoted`, `quoteAccepted`, `quoteRejected`, `rfqClosed`, ...) streams back over `SERVER_MSG.WORKFLOW_EVENT` to `WorkflowPort.events()`.
10. `WorkflowEventStreamUseCase.execute()` (`packages/domain/src/usecases/WorkflowEventStreamUseCase.ts`) `scan`s every event through the pure `reduceRfqEvent()` reducer into an `RfqStreamState` (`ReadonlyMap` of RFQs and quotes); `RfqsPresenter` derives `rfqs$`, `allQuotes$`, and per-RFQ `quotesForRfq$` from it, each `distinctUntilChanged` + `shareReplay`.
11. `useRfqs()` / `useQuotesForRfq(rfqId)` re-render `RfqsPanel.tsx` and `RfqCard.tsx` as quotes arrive and the RFQ closes.

Same message exchange: [§4.3 Credit RFQ Workflow](04-sequence-diagrams.md#43-credit-rfq-workflow). Same per-quote and per-RFQ state machines: [§5.2 Quote State Machine](05-state-diagrams.md#52-quote-state-machine-credit-rfq), [§5.3 RFQ Lifecycle](05-state-diagrams.md#53-rfq-lifecycle).

**Animated: the quote race.** `15-rfq-quote-race.svg` (SMIL, loops every 12s, same conventions as [`tick-journey.svg`](tick-journey.svg)) shows three dealer quotes starting `pendingWithoutPrice` together, two pricing in (`pendingWithPrice`) while the third passes, then the trader accepting one — the accepted quote turns green, the other priced quote turns red (`rejectedWithPrice`), matching §5.2's transition table:

![Animated diagram: three dealer quote pills starting pendingWithoutPrice; two price in in parallel while the third passes; the trader then accepts one, which turns green (accepted) while the other priced quote turns red (rejectedWithPrice)](15-rfq-quote-race.svg)

### 15.5 Equities Order — Ticket to Fill

Order placement is the one flow with **no domain use case in the client path** — `OrderTicketMachine` calls the port directly, matching `OrderPort`'s shape (`place`/`cancel`/`orders`, no enrichment step) and the "raw primitive" nature of the server's `placeOrder$` effect (§4.4).

```mermaid
flowchart TB
    subgraph ui["UI"]
        ticket["OrderTicket.tsx — Submit"]:::ui
    end
    subgraph bindings["@rtc/react-bindings"]
        hook["useOrderTicket(symbol)<br/>useMachine(machines.orderTicket)"]:::bridge
    end
    subgraph core["@rtc/client-core"]
        machine["OrderTicketMachine<br/>intents.submit()"]:::core
        blotterPres["OrdersBlotterPresenter.place()"]:::core
    end
    subgraph domainL["@rtc/domain — no use case, direct pass-through"]
        port["OrderPort.place(req)"]:::domain
    end
    subgraph adapters["Adapter (portFactory.ts)"]
        wsOrder["createOrderPort(ws)<br/>rpc PLACE_ORDER · on ORDER_LIFECYCLE"]:::server
        simOrder["EquityOrderSimulator (Mode A, in-process)"]:::domain
    end
    subgraph serverL["@rtc/server (Mode B)"]
        placeEffect["placeOrder$ (raw WsEffect)<br/>ack {orderId} + ORDER_LIFECYCLE stream,<br/>ONE shareReplay(1) source for both"]:::server
        orderSim["EquityOrderSimulator (on server)"]:::domain
        posSim["EquityPositionSimulator.onFill()"]:::domain
    end

    ticket -->|"1"| hook -->|"2"| machine -->|"3"| blotterPres -->|"4"| port --> wsOrder & simOrder
    wsOrder -->|"5 rpc"| placeEffect --> orderSim -->|"6 onFill"| posSim
    orderSim -.->|"7 lifecycle event"| placeEffect -.->|"ORDER_LIFECYCLE frames"| wsOrder
    wsOrder -.-> port
    simOrder -.-> port
    port -.->|"8"| blotterPres -.-> machine -.->|"9 working → filled"| hook -.-> ticket
```

1. `OrderTicket.tsx` reads `useOrderTicket` and calls `intents.submit()`.
2. `useOrderTicket(symbol)` is a per-mount `useMachine(machines.orderTicket(defaultSymbol))`, wired in `composition.ts` (`orderTicket: (defaultSymbol) => createOrderTicketMachine({ place: presenters.ordersBlotter.place, defaultSymbol })`).
3. `createOrderTicketMachine` (`packages/client-core/src/presenters/OrderTicketMachine.ts`) validates the form (`qty > 0`, a limit price for `type: "limit"`), goes `editing → submitting`, and calls `deps.place(req)`.
4. `deps.place` is `OrdersBlotterPresenter.place()` (`packages/client-core/src/presenters/OrdersBlotterPresenter.ts`), which calls `this.orderPort.place(req)` — **directly**; there is no `PlaceOrderUseCase` in `@rtc/domain/usecases`, unlike every other command flow in this document.
5. In Mode B, `createOrderPort(ws)` (`portFactory.ts`) sends `CLIENT_MSG.PLACE_ORDER` via `ws.rpc(...)`. The `placeOrder$` effect (`packages/server/src/effects/equities.effects.ts`) is a raw `WsEffect`, not the `rpc()`/`stream()` sugar — it builds one `shareReplay({ bufferSize: 1, refCount: true })` source from `ctx.orders.place(...)` and derives *both* the RPC ack (`take(1)`, mapped to `{ orderId }`) and the `ORDER_LIFECYCLE` stream from it, so the ack and the first lifecycle frame can never race.
6. `EquityOrderSimulator` (`packages/domain/src/simulators/` — Mode A runs the same class in-process) advances the order through `new → working → partiallyFilled → filled` (or `rejected`); each fill also calls `EquityPositionSimulator.onFill(fill)`, updating the Positions blotter on a stream `OrderTicketMachine` never touches.
7–8. Lifecycle frames flow back through `OrderPort.place()`'s `Observable` (`createOrderPort`'s `ws.on(SERVER_MSG.ORDER_LIFECYCLE, ...)` filters by `orderId` and completes on a terminal status) into `OrdersBlotterPresenter.place()` and back to the machine.
9. `orderToPhase()` inside the machine maps each `EquityOrder.status` to a `OrderTicketState` phase (`working` / `partiallyFilled` / `filled` / `rejected`); `useOrderTicket` re-renders `OrderTicket.tsx` at each phase.

Same message exchange, including the "ack + stream from one shared source" detail: [§4.4 Equities Order Lifecycle](04-sequence-diagrams.md#44-equities-order-lifecycle).

### 15.6 Admin Telemetry — Simulated Metrics to Chart

This flow never touches the wire in *either* mode — confirmed by grepping `packages/shared/src/protocol/messages.ts` for any `telemetry`/throughput-sampling message name and finding none. `TelemetrySimulator` is constructed directly in both `createSimulatorPorts` and `createWsRealPorts` (`packages/client-core/src/adapters/portFactory.ts`), mirroring how `preferences` is handled — see the "always local" callout in [§7 Runtime Topology](07-communication-patterns.md#runtime-topology-what-runs-when). (The `admin` throughput *setpoint* is the one exception: `GET_THROUGHPUT`/`SET_THROUGHPUT` *is* WS-backed in Mode B — only the sampled telemetry series are always local.)

```mermaid
flowchart TB
    subgraph domainL["@rtc/domain — always in-process, both modes"]
        sim["TelemetrySimulator<br/>wraps ThroughputSimulator + LatencySimulator + ErrorRateSimulator<br/>mulberry32 seeded random walk"]:::domain
        port["TelemetryPort<br/>throughput$() · latency$() · errorRate$()"]:::domain
    end
    subgraph core["@rtc/client-core"]
        presT["ThroughputMetricPresenter<br/>windowedSamples(port.throughput$())"]:::core
        presL["LatencyPresenter"]:::core
        presE["ErrorRatePresenter"]:::core
    end
    subgraph bindings["@rtc/react-bindings"]
        hook["useMetrics()<br/>{ throughput, latency, errorRate }"]:::bridge
    end
    subgraph ui["UI"]
        chart["ThroughputChart.tsx<br/>LatencyHistogram.tsx · KpiRow.tsx"]:::ui
    end

    sim -->|"1 MetricSample every tick"| port -->|"2"| presT & presL & presE -->|"3 samples$"| hook -->|"4"| chart
```

1. `TelemetrySimulator` (`packages/domain/src/simulators/TelemetrySimulator.ts`) walks each metric as a seeded random offset around the admin-set throughput setpoint (`mulberry32` PRNG, `WALK_STEP_FRACTION`/`WALK_CLAMP_FRACTION`), emitting a `MetricSample { t, value }` per tick from `throughput$()`/`latency$()`/`errorRate$()` (`packages/domain/src/ports/telemetryPort.ts`).
2. Each `*MetricPresenter` (`packages/client-core/src/presenters/ThroughputMetricPresenter.ts` and its `LatencyPresenter`/`ErrorRatePresenter` siblings) pipes the port stream through `windowedSamples()` (`packages/client-core/src/presenters/windowedSamples.ts`), rolling the last N samples oldest-first for a chart series.
3. `useMetrics()` (bound in `createViewModel.ts`) plain-`bind`s all three `samples$` streams (not per-mount — one shared subscription for every consumer).
4. `ThroughputChart.tsx`, `LatencyHistogram.tsx`, and `KpiRow.tsx` (`packages/client-react/src/ui/admin/`) re-render on each new sample.

There is no §4/§5 message-level companion for this flow — it is the one flow in this document with no wire protocol at all, which is itself the point: the same seam (`TelemetryPort`) that would carry a WS message in a wire-backed flow here just wraps a local class, and nothing above the port can tell the difference.

---
