## 6. Package Dependencies

Nine workspace packages plus the `tests` package. Every arrow is a real `dependencies` entry; dependencies flow **inward only** (toward `domain`).

```mermaid
graph TB
    subgraph clients["Clients (frameworks & drivers)"]
        webc["@rtc/client-react\nReact 19 + Vite\ndumb UI + browser adapters"]
        rnc["@rtc/client-react-native\nExpo SDK 57 / RN 0.86\ndumb UI + native adapters"]
        solidc["@rtc/client-solid\nSolidJS -- PLANNED"]
    end

    subgraph bridge["Bindings (framework ↔ streams)"]
        rb["@rtc/react-bindings\ncreateViewModel · useMachine\n@react-rxjs/core"]
        sb["@rtc/solid-bindings\nPLANNED\nObservable → signal"]
    end

    core["@rtc/client-core\nApplication Core\npresenters · machines · ports wiring\nRxJS + @rx-state/core, zero framework"]

    subgraph backend["Server side"]
        server["@rtc/server\nNode.js + ws\n24 declarative effects"]
        wse["@rtc/ws-effects\nEffects framework\nrxjs only"]
    end

    subgraph inner["Inner circles"]
        shared["@rtc/shared\nDTOs · wire protocol\nCLIENT_MSG / SERVER_MSG"]
        domain["@rtc/domain\nentities · ports · use cases · simulators\nrxjs only"]
    end

    proto["@rtc/client-prototype\ndesign-comprehension island\nreact + react-dom only"]
    tests["tests (@rtc/tests)\nbehavioural suites + gates"]

    webc --> rb
    webc --> core
    webc --> domain
    rnc --> rb
    rnc --> core
    rnc --> domain
    solidc -.-> sb
    solidc -.-> core
    rb --> core
    rb --> domain
    sb -.-> core
    core --> domain
    core --> shared
    server --> domain
    server --> shared
    server --> wse
    shared --> domain
    tests --> webc
    tests --> core
    tests --> server
    tests --> domain

    style domain fill:#4CAF50,color:#fff
    style shared fill:#2196F3,color:#fff
    style core fill:#00897B,color:#fff
    style rb fill:#FF9800,color:#fff
    style webc fill:#FB8C00,color:#fff
    style rnc fill:#8E24AA,color:#fff
    style server fill:#9C27B0,color:#fff
    style wse fill:#5E35B1,color:#fff
    style proto fill:#607D8B,color:#fff
    style solidc fill:#607D8B,color:#fff,stroke-dasharray: 5 5
    style sb fill:#607D8B,color:#fff,stroke-dasharray: 5 5
    style tests fill:#455A64,color:#fff
```

**Dependency rules** (each machine-enforced):
- `@rtc/domain` has **`rxjs` as its single runtime dependency** -- the explicit architectural exception, used as the boundary stream type. No other runtime deps are permitted (pnpm strict mode). `@rtc/ws-effects` follows the same rxjs-only constraint.
- `@rtc/shared` depends only on `domain`.
- `@rtc/client-core` depends on `domain` + `shared` (+ `rxjs`, `@rx-state/core`) and on **no framework** -- no React, no DOM types, no React Native.
- `@rtc/react-bindings` is the only package allowed to depend on both React and the core's streams.
- Clients (`client-react`, `client-react-native`) depend on `core` + `react-bindings` + `domain`; **clients and server never import each other** (dependency-cruiser `client-not-server` / `server-not-client`).
- `@rtc/client-prototype` is an intentional island: `react`/`react-dom` only, no `@rtc/*` imports.

**Build order** (Turborepo topological): `domain` → `shared` | `ws-effects` → `client-core` → `react-bindings` → `client-react` | `client-react-native` | `server` (prototype builds independently).

> The inward-only rule is machine-enforced by **dependency-cruiser** as a blocking CI gate (`pnpm check:deps`, config at `.dependency-cruiser.cjs`): `no-circular`, `domain-stays-pure`, `domain-no-node-builtins`, `shared-no-apps`, `client-not-server`, `server-not-client`, `ws-effects-stays-pure`. See [dependency-cruiser.md](./dependency-cruiser.md) for the rule-by-rule breakdown.

> **History**: the Application Layer originally lived inside `@rtc/client-react` (the doc's earlier revisions called this out as a possible future extraction). The React Native workstream forced the question, and the extraction happened: `@rtc/client-core` + `@rtc/react-bindings` are that promotion, executed without breaking UI consumers -- exactly because components only ever imported the hook bridge.

---

