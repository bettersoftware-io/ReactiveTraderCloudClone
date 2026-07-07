# dependency-cruiser configuration

`.dependency-cruiser.cjs` is the **executable form of the clean-architecture
layering** described in [architecture.md §6](./architecture.md#6-package-dependencies):
"dependencies flow inward only." Where Biome's `noRestrictedImports` only sees a
single literal import string, dependency-cruiser resolves the **whole module
graph** — so it catches a forbidden layer crossing even when it happens
*transitively* through several intermediate modules.

It runs as a blocking gate:

```bash
pnpm check:deps   # depcruise --config .dependency-cruiser.cjs packages tests
```

and is wired into the CI `checks` job alongside the other static-analysis gates.

## The allowed dependency graph

Dependencies may only flow **inward** (toward `domain`). Every other internal
edge is forbidden.

```mermaid
graph TD
    webc["@rtc/client-react<br/>(web UI + browser adapters)"]
    rnc["@rtc/client-react-native<br/>(RN UI + native adapters)"]
    rb["@rtc/react-bindings<br/>(ViewModel bridge)"]
    core["@rtc/client-core<br/>(application core)"]
    server["@rtc/server<br/>(WebSocket server)"]
    wse["@rtc/ws-effects<br/>(effects framework, rxjs only)"]
    shared["@rtc/shared<br/>(DTOs / wire protocol)"]
    domain["@rtc/domain<br/>(entities, ports, use cases, simulators)<br/>runtime dep: rxjs only"]
    proto["@rtc/client-prototype<br/>(design island — no @rtc/* deps)"]

    webc -->|allowed| rb
    webc -->|allowed| core
    webc -->|allowed| domain
    rnc -->|allowed| rb
    rnc -->|allowed| core
    rnc -->|allowed| domain
    rb -->|allowed| core
    rb -->|allowed| domain
    core -->|allowed| shared
    core -->|allowed| domain
    server -->|allowed| shared
    server -->|allowed| domain
    server -->|allowed| wse
    shared -->|allowed| domain

    webc -. "forbidden:<br/>client-not-server" .-x server
    server -. "forbidden:<br/>server-not-client" .-x webc
    shared -. "forbidden:<br/>shared-no-apps" .-x server
    domain -. "forbidden:<br/>domain-stays-pure" .-x shared
    wse -. "forbidden:<br/>ws-effects-stays-pure" .-x domain

    classDef pure fill:#4CAF50,color:#fff;
    classDef dto fill:#2196F3,color:#fff;
    classDef coreC fill:#00897B,color:#fff;
    classDef app fill:#FF9800,color:#fff;
    classDef srv fill:#9C27B0,color:#fff;
    classDef isle fill:#607D8B,color:#fff;
    class domain pure;
    class shared dto;
    class core,rb coreC;
    class webc,rnc app;
    class server,wse srv;
    class proto isle;
```

Solid arrows are permitted imports; dashed crossed (`-.-x`) arrows are examples of
the edges the `forbidden` rules reject. `domain-stays-pure` forbids
`domain → shared` (and by extension `domain → client/server`);
`ws-effects-stays-pure` keeps the effects framework domain-blind; the apps may
reach inward but never reach across to each other.

## The 7 forbidden rules

All rules are `severity: "error"` — any match fails the gate.

| Rule | `from` (source) | `to` (rejected target) | Protects |
|------|-----------------|------------------------|----------|
| `no-circular` | anything | any module forming a cycle | No import loops (type-only edges excluded) |
| `domain-stays-pure` | `^packages/domain/src` | `^packages/(shared\|client-react\|server)/` | Domain is the innermost layer — no internal deps |
| `domain-no-node-builtins` | `^packages/domain/src` (tests and `__testUtils__` excepted) | Node built-ins (`dependencyTypes: ["core"]`) | Domain runs in any JS environment — browser, RN, Node |
| `shared-no-apps` | `^packages/shared/src` | `^packages/(client-react\|server)/` | Shared may only reach inward to domain |
| `client-not-server` | `^packages/client-react/src` | `^packages/server/` | The two apps never couple |
| `server-not-client` | `^packages/server/src` | `^packages/client-react/` | (mirror of the above) |
| `ws-effects-stays-pure` | `^packages/ws-effects/src` | `^packages/(domain\|shared\|client-react\|server)/` | The effects framework is domain-blind and app-agnostic (rxjs only) |

**Asymmetry to note:** each rule matches the *source* against `…/src` but the
*target* against the **bare package path** (e.g. `^packages/server/`). So
importing a server **test** file from the client is rejected too — not only
`server/src`.

**Scope note:** the pairwise rules still name only the original apps
(`client-react`, `server`). The newer packages are protected by `no-circular`,
`ws-effects-stays-pure`, and pnpm strict dependencies (a package simply cannot
resolve an undeclared `@rtc/*` import), but there are no dedicated pair rules for
`client-core` / `react-bindings` / `client-react-native` yet — broadening the
regexes is an open, low-priority TODO.

## The `options` block (how the graph is built)

```js
options: {
  tsPreCompilationDeps: false,
  tsConfig: { fileName: "tsconfig.base.json" },
  doNotFollow: { path: "node_modules" },
  exclude: { path: "(\\.cache|/dist/|/__screenshots__/|\\.turbo)" },
  enhancedResolveOptions: {
    exportsFields: ["exports"],
    conditionNames: ["import", "types", "node", "default"],
  },
}
```

- **`tsPreCompilationDeps: false`** — the most important line. It drops
  `import type` edges, which disappear after compilation. Counting them produces
  *phantom* cycles. Tools that count type edges (`madge`, `dpdm` without `-T`)
  report "4 circular dependencies" here; with type edges excluded the true count
  is **0**. (See the tool comparison in
  [tooling-roadmap.md §4](./tooling-roadmap.md#4-dependency-cruiser----circular-deps--architecture).)
- **`tsConfig: tsconfig.base.json`** — reads the repo's TS path mappings so
  aliased imports resolve to their real files.
- **`doNotFollow: node_modules`** — map first-party code only; don't descend
  into third-party packages.
- **`exclude: (\.cache|/dist/|/__screenshots__/|\.turbo)`** — skip build
  artifacts: compiled `dist/`, Turborepo's `.turbo`, visual-test
  `__screenshots__`, and the Playwright-CT Vite host `.cache`. (The `.cache`
  entry exists because a Vite-bundled host cache produced a false `no-circular`
  during adoption — the cache is generated output, not source.)
- **`enhancedResolveOptions`** — `exportsFields` + `conditionNames` make the
  cruiser honor `package.json` `"exports"`/`"imports"`. This is how the repo's
  `#/` subpath-alias imports resolve to source files.

## Why this is stronger than the Biome ban

The Biome `noRestrictedImports` rule (`../../**`) bans deep relative imports by
inspecting the literal import string in a single file. It cannot see that
`client → shared → server` crosses a layer boundary, because each individual
import looks innocent. dependency-cruiser resolves the transitive graph, so the
layering holds even through indirection. The two are complementary: Biome keeps
import *strings* tidy; dependency-cruiser keeps the dependency *graph* legal.

## See also

- [architecture.md §6 — Package Dependencies](./architecture.md#6-package-dependencies) (the prose rule this config enforces)
- [architecture.md §12 — Architectural Gates](./architecture.md#12-architectural-gates) (the regex-based `grep-gates` that guard import boundaries inside the test suite)
- [tooling-roadmap.md §4 — dependency-cruiser](./tooling-roadmap.md#4-dependency-cruiser----circular-deps--architecture) (adoption rationale and the type-edge cycle finding)
