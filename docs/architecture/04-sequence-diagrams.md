[◀ 3. UML Class Diagrams](03-uml-class-diagrams.md) · [Architecture Document](../architecture.md) · [5. State Diagrams ▶](05-state-diagrams.md)

## 4. Sequence Diagrams

### 4.1 FX Price Streaming

```mermaid
sequenceDiagram
    participant Trader
    participant Tile as FX Tile (React / RN)
    participant Hook as usePrice (ViewModel, react-bindings)
    participant Presenter as PriceStreamPresenter (client-core)
    participant UC as PriceStreamUseCase
    participant Adapter as Port Adapter (Simulator or WsReal)
    participant Server as WS Server (real mode only)

    Trader->>Tile: Opens FX workspace
    Tile->>Hook: usePrice("EURUSD")
    Hook->>Presenter: subscribe price$("EURUSD")
    Presenter->>UC: execute("EURUSD")
    UC->>Adapter: getPriceUpdates("EURUSD") returns Observable

    alt Mock mode (in-process simulator)
        loop Every 150-1000ms
            Adapter-->>UC: emit PriceTick
            UC->>UC: detectMovement + calculateSpread
            UC-->>Presenter: emit Price
            Presenter-->>Hook: emit Price
            Hook-->>Tile: re-render
            Tile->>Trader: bid/ask/spread/movement
        end
    else Real mode (WS adapter)
        Adapter->>Server: subscribe.pricing(EURUSD)
        loop Continuous
            Server-->>Adapter: stream.priceTick(PriceTickDto)
            Adapter-->>UC: emit PriceTick
            UC->>UC: detectMovement + calculateSpread
            UC-->>Presenter: emit Price
            Presenter-->>Hook: emit Price
            Hook-->>Tile: re-render
            Tile->>Trader: bid/ask/spread/movement
        end
    end
```

The tile — web or mobile, the flow is identical — knows nothing about subscriptions, transports, or enrichment. It calls `useViewModel().usePrice(symbol)` and renders. Enrichment (`detectMovement + calculateSpread`) lives in the use case, not the hook. In real mode the server side of the stream is the `pricing$` effect (`stream(SUBSCRIBE_PRICING, ...)` in `packages/server/src/effects/fx.effects.ts`).

### 4.2 FX Trade Execution (RPC)

```mermaid
sequenceDiagram
    participant Trader
    participant Tile as FX Tile (React / RN)
    participant Hook as useTileExecution (ViewModel machine)
    participant Presenter as TradeExecutionPresenter (client-core)
    participant UC as ExecuteTradeUseCase
    participant Adapter as Port Adapter
    participant Server as WS Server
    participant ExecSim as ExecutionSimulator
    participant Store as TradeStoreSimulator
    participant BlotterHook as useTrades (Blotter)

    Trader->>Tile: Clicks Buy/Sell at displayed rate
    Tile->>Hook: execute(currencyPair, spotRate, direction, notional)
    Hook->>Presenter: dispatch executionIntent
    Presenter->>UC: execute(ExecutionRequest)
    UC->>Adapter: executeTrade(request) returns Observable (emits once)

    alt Real mode
        Adapter->>Server: rpc.executeTrade with correlationId 42
        Server->>ExecSim: executeTrade(request)
        alt Normal (0-2s delay)
            ExecSim-->>Server: Trade Done
            ExecSim->>Store: notifyListeners(trade)
        else GBPJPY always rejected
            ExecSim-->>Server: Trade Rejected
        else EURJPY (4s extra delay)
            ExecSim-->>Server: Trade Done
            ExecSim->>Store: notifyListeners(trade)
        end
        Server-->>Adapter: rpc.executeTrade.response with correlationId 42
    else Mock mode (in-process)
        Adapter->>ExecSim: executeTrade(request)
        ExecSim-->>Adapter: Trade
    end

    Adapter-->>UC: resolved Trade
    UC-->>Presenter: Trade
    Presenter-->>Hook: emit Trade
    Hook-->>Tile: confirmation state
    Tile->>Trader: confirmation (5s auto-dismiss)

    Store-->>BlotterHook: trade list updated (separate stream)
    BlotterHook->>Trader: New trade appears in blotter
```

### 4.3 Credit RFQ Workflow

```mermaid
sequenceDiagram
    participant Trader
    participant Form as New RFQ Form (React)
    participant Tiles as RFQ Tiles (React)
    participant Hook as useRfqs (ViewModel)
    participant Presenter as RfqsPresenter (client-core)
    participant CreateUC as CreateRfqUseCase
    participant EventsUC as WorkflowEventStreamUseCase
    participant Adapter as Port Adapter
    participant Server as WS Server
    participant Sim as CreditRfqSimulator

    Trader->>Form: Selects instrument, dealers, quantity, direction
    Trader->>Form: Clicks Send RFQ
    Form->>Hook: createRfq(...)
    Hook->>Presenter: dispatch createIntent
    Presenter->>CreateUC: execute(request)
    CreateUC->>Adapter: createRfq(request)
    Adapter->>Server: rpc.createRfq with correlationId N
    Server->>Sim: createRfq(request)
    Sim->>Sim: Create Rfq state Open

    loop Per selected dealer
        Sim->>Sim: Create Quote pendingWithoutPrice
        Sim-->>Server: RfqEvent quoteCreated
        Server-->>Adapter: stream.workflowEvent
        Adapter-->>EventsUC: emit event
        EventsUC-->>Presenter: emit event
        Presenter-->>Hook: rfqs$ updated
    end

    Sim-->>Server: RfqEvent rfqCreated
    Server-->>Adapter: rpc.createRfq.response correlationId N
    Adapter-->>CreateUC: resolved rfqId
    CreateUC-->>Presenter: rfqId

    par Dealer simulation 0-30s, 70 percent respond
        Sim->>Sim: Dealer A quotes
        Sim-->>Server: RfqEvent quoteQuoted
        Server-->>Adapter: stream.workflowEvent
        Adapter-->>EventsUC: emit
        EventsUC-->>Presenter: rfqs$ updated
        Presenter-->>Hook: emit
        Hook-->>Tiles: Quote A shows price
    and
        Sim->>Sim: Dealer B quotes
        Sim-->>Server: RfqEvent quoteQuoted
        Server-->>Adapter: stream.workflowEvent
        Adapter-->>EventsUC: emit
        EventsUC-->>Presenter: rfqs$ updated
        Presenter-->>Hook: emit
        Hook-->>Tiles: Quote B shows price
    end

    Trader->>Tiles: Clicks Accept on best quote
    Tiles->>Hook: acceptQuote(quoteId)
    Hook->>Presenter: acceptQuote(quoteId)
    Presenter->>Adapter: workflow.accept(quoteId)
    Note over Presenter,Adapter: accept/cancel/pass are direct port pass-throughs (no use case)
    Adapter->>Server: rpc.accept
    Server->>Sim: accept(quoteId)
    Sim->>Sim: Accepted quote, others rejected, Rfq Closed
    Sim-->>Server: quoteAccepted + quoteRejected + rfqClosed events
    Server-->>Adapter: stream.workflowEvent x N
    Adapter-->>EventsUC: emit events
    EventsUC-->>Presenter: rfqs$ updated
    Presenter-->>Hook: emit
    Hook-->>Tiles: RFQ Closed, accepted quote highlighted
    Tiles->>Trader: Accepted quote highlighted
```

### 4.4 Equities Order Lifecycle

Placing an equity order is the one message flow that is **both** an RPC and a stream: the `placeOrder$` effect acks the RPC with the `orderId`, then keeps streaming `ORDER_LIFECYCLE` frames for that order until it reaches a terminal state. The client-side `OrderPort.place()` Observable completes on `filled`/`cancelled`/`rejected`.

```mermaid
sequenceDiagram
    participant Trader
    participant Ticket as Order Ticket (React / RN)
    participant Hook as useOrderTicket (ViewModel machine)
    participant Machine as OrderTicketMachine (client-core)
    participant Port as OrderPort (createOrderPort)
    participant Effect as placeOrder$ effect (server)
    participant OrderSim as EquityOrderSimulator
    participant PosSim as EquityPositionSimulator

    Trader->>Ticket: Sets side/qty/limit, taps Submit
    Ticket->>Hook: submit intent
    Hook->>Machine: dispatch(submit)
    Machine->>Port: place(request)
    Port->>Effect: rpc PLACE_ORDER (correlationId N)
    Effect->>OrderSim: place(request) → shared lifecycle$
    Effect-->>Port: PLACE_ORDER_RESPONSE ack { orderId }
    loop until terminal state
        OrderSim-->>Effect: lifecycle event (new → partial fills → filled)
        Effect-->>Port: ORDER_LIFECYCLE frame
        Port-->>Machine: emit OrderEvent
        Machine-->>Hook: state$ update
        Hook-->>Ticket: progress render
    end
    OrderSim->>PosSim: onFill(fill)
    Note over PosSim: positions$ subscription (separate stream)<br/>updates the Positions blotter
    Port-->>Machine: complete (terminal event)
    Ticket->>Trader: Order filled confirmation
```

The server keeps exactly one lifecycle observable per order (`shareReplay(1)` with refcount) so the ack and the stream cannot race; `placeOrder$` carries its own `catchError → nack` so a bad order rejects that one RPC without disabling the effect.

---

