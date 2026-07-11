# Reactive Trader Cloud -- Architecture Document

This document is split into one file per section under
[`docs/architecture/`](architecture/). Start with the
[Overview](architecture/01-overview.md) if you are new to the codebase.

## How to read this

**New here?** Start with the [Overview](architecture/01-overview.md) to understand the system's purpose and architectural principles. Next, explore the [Codebase Map](architecture/13-codebase-map.md) to see how packages fit together and their module structure. Then, read your app's package README in `packages/<name>/` — each describes its role, dependencies, entry points, and how to start using it. If you work on the web client's shell — layout, animation, boot, lock — finish with [The Web Client, Up Close](architecture/17-web-client-up-close.md).

**Changing something?** Go to [Trailheads](architecture/16-trailheads.md) — it maps common tasks to the sections and files you'll need to touch.

**Deep reference?** The sections [C4 Model](architecture/02-c4-model.md) through [Test Strategy](architecture/09-test-strategy.md) (§2–§9), along with [Key Files Reference](architecture/11-key-files-reference.md) and [Architectural Gates](architecture/12-architectural-gates.md) (§11–§12), provide detailed diagrams, sequence flows, state machines, communication patterns, design decisions, and enforcement rules.

## Table of Contents

1. [Overview](architecture/01-overview.md)
   - [Purpose](architecture/01-overview.md#11-purpose)
   - [Architectural Principles](architecture/01-overview.md#12-architectural-principles)
   - [Layered Architecture & Terminology](architecture/01-overview.md#13-layered-architecture--terminology)
   - [Technology Choices](architecture/01-overview.md#14-technology-choices)
2. [C4 Model](architecture/02-c4-model.md)
   - [System Context](architecture/02-c4-model.md#21-system-context-diagram)
   - [Container Diagram](architecture/02-c4-model.md#22-container-diagram)
   - [Component Diagram -- Web Client](architecture/02-c4-model.md#23-component-diagram----web-client)
   - [Component Diagram -- React Native Client](architecture/02-c4-model.md#24-component-diagram----react-native-client)
   - [Component Diagram -- WebSocket Server](architecture/02-c4-model.md#25-component-diagram----websocket-server)
3. [UML Class Diagrams](architecture/03-uml-class-diagrams.md)
   - [FX Domain Entities](architecture/03-uml-class-diagrams.md#31-fx-domain-entities)
   - [Credit Domain Entities](architecture/03-uml-class-diagrams.md#32-credit-domain-entities)
   - [Ports & Adapters](architecture/03-uml-class-diagrams.md#33-ports--adapters-hexagonal-architecture)
   - [Use Cases](architecture/03-uml-class-diagrams.md#34-use-cases)
   - [Presenters, Machines & State Streams](architecture/03-uml-class-diagrams.md#35-presenters-machines--state-streams)
   - [The ViewModel Seam](architecture/03-uml-class-diagrams.md#36-the-viewmodel-seam)
4. [Sequence Diagrams](architecture/04-sequence-diagrams.md)
   - [FX Price Streaming](architecture/04-sequence-diagrams.md#41-fx-price-streaming)
   - [FX Trade Execution](architecture/04-sequence-diagrams.md#42-fx-trade-execution-rpc)
   - [Credit RFQ Workflow](architecture/04-sequence-diagrams.md#43-credit-rfq-workflow)
   - [Equities Order Lifecycle](architecture/04-sequence-diagrams.md#44-equities-order-lifecycle)
5. [State Diagrams](architecture/05-state-diagrams.md)
   - [Connection Status](architecture/05-state-diagrams.md#51-connection-status)
   - [Quote State Machine](architecture/05-state-diagrams.md#52-quote-state-machine-credit-rfq)
   - [RFQ Lifecycle](architecture/05-state-diagrams.md#53-rfq-lifecycle)
   - [FX Trade Execution Flow](architecture/05-state-diagrams.md#54-fx-trade-execution-flow)
6. [Package Dependencies](architecture/06-package-dependencies.md)
7. [Communication Patterns](architecture/07-communication-patterns.md)
   - [WebSocket Message Format](architecture/07-communication-patterns.md#websocket-message-format)
   - [Three Communication Styles](architecture/07-communication-patterns.md#three-communication-styles)
   - [Observable Pipeline](architecture/07-communication-patterns.md#observable-pipeline)
   - [Runtime Topology: What Runs When](architecture/07-communication-patterns.md#runtime-topology-what-runs-when)
   - [Animated: The Life of a Price Tick](architecture/07-communication-patterns.md#animated-the-life-of-a-price-tick)
   - [The Declarative Effects Server (`@rtc/ws-effects`)](architecture/07-communication-patterns.md#the-declarative-effects-server-rtcws-effects)
   - [Equities Over the Wire](architecture/07-communication-patterns.md#equities-over-the-wire-gap-closed)
   - [Deployment Topology](architecture/07-communication-patterns.md#deployment-topology)
8. [Replaceability Matrix](architecture/08-replaceability-matrix.md)
   - [The Multi-Client Proof & the SolidJS Plan](architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-plan)
9. [Test Strategy](architecture/09-test-strategy.md)
10. [Key Design Decisions](architecture/10-key-design-decisions.md)
11. [Key Files Reference](architecture/11-key-files-reference.md)
12. [Architectural Gates](architecture/12-architectural-gates.md)
13. [Codebase Map](architecture/13-codebase-map.md)
   - [13.1 L0 -- The System On One Screen](architecture/13-codebase-map.md#131-l0----the-system-on-one-screen)
   - [13.2 L1 -- The Package Line Map](architecture/13-codebase-map.md#132-l1----the-package-line-map)
   - [13.3 L2 -- Module Maps](architecture/13-codebase-map.md#133-l2----module-maps)
   - [13.4 The Reuse Matrix](architecture/13-codebase-map.md#134-the-reuse-matrix)
14. [Composition & Wiring](architecture/14-composition-and-wiring.md)
   - [14.1 The Composition Root](architecture/14-composition-and-wiring.md#141-the-composition-root)
   - [14.2 Adapter Tables Per App](architecture/14-composition-and-wiring.md#142-adapter-tables-per-app)
   - [14.3 Boot Sequences](architecture/14-composition-and-wiring.md#143-boot-sequences)
15. [Flows](architecture/15-flows.md)
   - [15.1 Control Flow vs Imports vs Data Flow](architecture/15-flows.md#151-control-flow-vs-imports-vs-data-flow)
16. [Trailheads](architecture/16-trailheads.md)
17. [The Web Client, Up Close](architecture/17-web-client-up-close.md)
   - [17.1 The Component Tree and the Provider Stack](architecture/17-web-client-up-close.md#171-the-component-tree-and-the-provider-stack)
   - [17.2 The Layout System](architecture/17-web-client-up-close.md#172-the-layout-system)
   - [17.3 The Motion Toolbox](architecture/17-web-client-up-close.md#173-the-motion-toolbox)
   - [17.4 The Boot Splash](architecture/17-web-client-up-close.md#174-the-boot-splash)
   - [17.5 The Session Lock](architecture/17-web-client-up-close.md#175-the-session-lock)
