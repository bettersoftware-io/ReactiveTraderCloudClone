import type { IConfiguration } from "dependency-cruiser";

// Package-boundary rules use a "closed allowlist" shape:
//
//   from: { path: "^packages/<pkg>/src" },
//   to:   { path: "^packages/", pathNot: "^packages/(<pkg>|<allowed>…)/" },
//
// i.e. "from <pkg>, importing ANY package that is not <pkg> itself or one of
// its explicitly-allowed dependencies is forbidden." This is deliberately
// preferred over the older enumerate-every-forbidden-sibling shape
// (`to: { path: "^packages/(a|b|c|…)/" }`): an enumerated blocklist silently
// goes stale the moment a new package is added — the new package isn't in any
// existing list, so a leaf could import it undetected. The allowlist form has
// no such gap: a new package is forbidden by default until it is explicitly
// added to a rule's `pathNot`. (`clients-never-import-each-other` below has
// used this `pathNot` idiom all along.)
//
// Type-only edges are globally excluded (`tsPreCompilationDeps: false`), so a
// `import type { X } from "@rtc/other"` never counts as a dependency — which is
// why some "pure" leaves legitimately type-import a sibling.
const config: IConfiguration = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependency. Type-only edges are excluded (tsPreCompilationDeps:false).",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-stays-pure",
      severity: "error",
      comment:
        "@rtc/domain is the innermost leaf — it must not depend on any other @rtc package.",
      from: { path: "^packages/domain/src" },
      to: { path: "^packages/", pathNot: "^packages/domain/" },
    },
    {
      name: "domain-no-node-builtins",
      severity: "error",
      comment:
        "@rtc/domain source must run in any JS environment — no Node built-ins in production code (test files and __testUtils__ excepted).",
      from: {
        path: "^packages/domain/src",
        pathNot: "(\\.test\\.ts$|/__testUtils__/)",
      },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "shared-no-apps",
      severity: "error",
      comment:
        "@rtc/shared depends only on domain/motion-core (the scripted Jarvis brain's typed-reveal chunk math) — no other @rtc package.",
      from: { path: "^packages/shared/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(shared|domain|motion-core)/",
      },
    },
    {
      name: "client-not-server",
      severity: "error",
      comment: "client and server must never import each other.",
      from: { path: "^packages/client-react/src" },
      to: { path: "^packages/server/" },
    },
    {
      name: "server-not-client",
      severity: "error",
      from: { path: "^packages/server/src" },
      to: { path: "^packages/client-react/" },
    },
    {
      name: "ws-effects-stays-pure",
      severity: "error",
      comment:
        "@rtc/ws-effects is a transport framework — it must not import any other @rtc package.",
      from: { path: "^packages/ws-effects/src" },
      to: { path: "^packages/", pathNot: "^packages/ws-effects/" },
    },
    {
      name: "agent-tools-stays-inner",
      severity: "error",
      comment:
        "@rtc/agent-tools is the framework-neutral Jarvis desk-tool package — it may depend only on domain (+ rxjs), never on shared, client-adapters, a client, bindings, or the server.",
      from: { path: "^packages/agent-tools/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(agent-tools|domain)/",
      },
    },
    {
      name: "no-anthropic-sdk-in-inner-packages",
      severity: "error",
      comment:
        "@anthropic-ai/sdk is a server-only dependency (Task 6, Jarvis phase 3) — every OTHER package stays framework-free of it, same as the react/react-dom/react-native bans above. Deliberately an allowlist over the single permitted importer (mirrors agent-tools-stays-inner's closed-allowlist shape) rather than an enumerated blocklist of the four packages that happened to matter at the time this rule was written — a blocklist would silently miss the browser clients, where an SDK import could ship a key-bearing code path into a bundle.",
      from: { path: "^packages/", pathNot: "^packages/server/" },
      to: { path: "node_modules/@anthropic-ai/" },
    },
    {
      name: "no-mcp-sdk-outside-server",
      severity: "error",
      comment:
        "@modelcontextprotocol/sdk is a server-only dependency (Jarvis phase 4) — the MCP endpoint lives in packages/server/src/mcp/ and every OTHER package stays free of the SDK, exactly like no-anthropic-sdk-in-inner-packages above: an allowlist over the single permitted importer, not a blocklist of packages that happened to matter when this was written. @rtc/agent-tools in particular must stay SDK-free — its whole design point is that the registry is transport-neutral raw JSON Schema.",
      from: { path: "^packages/", pathNot: "^packages/server/" },
      to: { path: "node_modules/@modelcontextprotocol/" },
    },
    {
      name: "devtools-core-stays-pure",
      severity: "error",
      comment:
        "@rtc/devtools-core decorates by structural shape — it must not import any other @rtc package.",
      from: { path: "^packages/devtools-core/src" },
      to: { path: "^packages/", pathNot: "^packages/devtools-core/" },
    },
    {
      name: "devtools-core-no-node-builtins",
      severity: "error",
      comment: "@rtc/devtools-core must run in any JS environment.",
      from: {
        path: "^packages/devtools-core/src",
        pathNot: "(\\.test\\.ts$|/__tests__/)",
      },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "devtools-app-protocol-only",
      severity: "error",
      comment:
        "@rtc/devtools-app understands only the wire protocol — devtools-core is its sole @rtc dependency.",
      from: { path: "^packages/devtools-app/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(devtools-app|devtools-core)/",
      },
    },
    {
      name: "devtools-relay-standalone",
      severity: "error",
      comment:
        "@rtc/devtools-relay is a standalone ws-only relay — it holds no protocol knowledge and must not import any other @rtc package.",
      from: { path: "^packages/devtools-relay/src" },
      to: { path: "^packages/", pathNot: "^packages/devtools-relay/" },
    },
    {
      name: "devtools-extension-is-a-leaf",
      severity: "error",
      comment:
        "@rtc/devtools-extension is a leaf consumer of the devtools pair — it may import only devtools-core (transport/protocol/store) and devtools-app (InspectorApp), never a client/server/domain package.",
      from: { path: "^packages/devtools-extension/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(devtools-extension|devtools-core|devtools-app)/",
      },
    },
    {
      name: "motion-core-stays-pure",
      severity: "error",
      comment:
        "@rtc/motion-core is zero-dependency pure view-layer math — it must not import any other @rtc package.",
      from: { path: "^packages/motion-core/src" },
      to: { path: "^packages/", pathNot: "^packages/motion-core/" },
    },
    {
      name: "boot-splash-stays-pure",
      severity: "error",
      comment:
        "@rtc/boot-splash is the framework-free boot/splash feature — it must not import any other @rtc package (it may touch the DOM: canvas engine + navigator/location gate).",
      from: { path: "^packages/boot-splash/src" },
      to: { path: "^packages/", pathNot: "^packages/boot-splash/" },
    },
    {
      name: "layout-dockview-stays-pure",
      severity: "error",
      comment:
        "@rtc/layout-dockview is the framework-neutral Dockview wrapper — it must not import any other @rtc package (it may touch the DOM: dockview-core mounts into a container element).",
      from: { path: "^packages/layout-dockview/src" },
      to: { path: "^packages/", pathNot: "^packages/layout-dockview/" },
    },
    {
      name: "dockview-only-in-layout-dockview",
      severity: "error",
      comment:
        "dockview (the supported vanilla-JS entry point — see the layout-dockview README for why it replaced dockview-core as the direct dependency) is confined to @rtc/layout-dockview — the engine must stay swappable by replacing one package (ADR-002); a direct client import would leak the engine's vocabulary. The unanchored `node_modules/dockview` path also nets `node_modules/dockview-core` as a substring match, so a direct dockview-core import stays caught too even though nothing in the tree declares it directly.",
      from: { path: "^packages/", pathNot: "^packages/layout-dockview/" },
      to: { path: "node_modules/dockview" },
    },
    {
      name: "ui-contract-stays-neutral",
      severity: "error",
      comment:
        "@rtc/ui-contract is the framework-neutral UI contract harness (shared by client-react and client-solid) — it may depend only on client-core-rxjs (the core its harness composes), core-api/core-logic/domain/motion-core (and on @rtc/shared for types, an edge this value-only graph does not see), never on a concrete client, a binding, or the server.",
      from: { path: "^packages/ui-contract/src" },
      to: {
        path: "^packages/",
        pathNot:
          "^packages/(ui-contract|client-core-rxjs|core-api|core-logic|domain|motion-core)/",
      },
    },
    {
      name: "core-api-stays-inner",
      severity: "error",
      comment:
        "@rtc/core-api is the types-only application-core contract — it may import only domain/shared (types), never a core, a binding, a client, or the server.",
      from: { path: "^packages/core-api/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(core-api|domain|shared)/",
      },
    },
    {
      name: "core-contract-stays-neutral",
      severity: "error",
      comment:
        "@rtc/core-contract is the paradigm-neutral behavioural spec of the application core — it may import only core-api and domain, never a core (each core's runner supplies its own factory), a binding, or a client.",
      from: { path: "^packages/core-contract/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(core-contract|core-api|domain)/",
      },
    },
    {
      name: "client-adapters-stays-inner",
      severity: "error",
      comment:
        "@rtc/client-adapters holds the ports every application core consumes — adapters, port factories, stores. It may depend only on core-api/core-logic/domain/shared: never on a core (a core is a sibling that receives these ports as arguments), a binding, any client, or the server.",
      from: { path: "^packages/client-adapters/src" },
      to: {
        path: "^packages/",
        pathNot:
          "^packages/(client-adapters|core-api|core-logic|domain|shared)/",
      },
    },
    {
      name: "client-adapters-framework-free",
      severity: "error",
      comment:
        "@rtc/client-adapters (the adapters) is framework-free by contract — no React/DOM/RN modules.",
      from: { path: "^packages/client-adapters/src" },
      to: {
        path: "(^|node_modules/)(react|react-dom|react-native|solid-js)(/|$)",
      },
    },
    {
      name: "web-clients-load-cores-lazily",
      severity: "error",
      comment:
        'A web client reaches an application core only through a dynamic import() (src/app/coreSelection.ts), so the bundler can put each core in its own lazy chunk and the entry bundle carries none (ADR-006 Decision 6; `pnpm check:core-bundle` proves it on a real build, this rule on source, without one). A static value import of a core anywhere in a client\'s source would pull that core into the eager set. An `import type { X }` is invisible to this graph (tsPreCompilationDeps:false) and costs nothing at runtime; the inline form, `import { type X }`, survives transpilation as a bare `import "…"` and IS caught. The same core reached through @rtc/ui-contract, whose harness imports it statically, is `ui-contract-only-in-client-tests` below.',
      from: {
        path: "^packages/client-(react|solid)/src",
        pathNot: "(\\.test\\.tsx?$|/__tests__/)",
      },
      to: {
        path: "^packages/client-core-(rxjs|async|effect)/",
        dynamic: false,
      },
    },
    {
      name: "ui-contract-only-in-client-tests",
      severity: "error",
      comment:
        "@rtc/ui-contract is a client's devDependency: the test harness, the contract specs, the visual matrix. Its harness imports the RxJS core statically, so one import of it from a web client's production source would put that core in the eager bundle by another road than the one `web-clients-load-cores-lazily` watches.",
      from: {
        path: "^packages/client-(react|solid)/src",
        pathNot: "(\\.test\\.tsx?$|/__tests__/)",
      },
      to: { path: "^packages/ui-contract/" },
    },
    {
      name: "adapter-fakes-stay-in-tests",
      severity: "error",
      comment:
        "@rtc/client-adapters's test scaffolding — its `./testing` entry, `adapters/__tests__/` and `*.testHelpers.ts` — is for tests. No production source in any package, this one included, may import it: a fake transport has no business in a shipped bundle.",
      from: {
        path: "^packages/[^/]+/(src|app)/",
        pathNot:
          "(\\.test\\.tsx?$|\\.spec\\.tsx?$|\\.testHelpers\\.ts$|/__tests__/|/testing/|^packages/client-adapters/src/testing\\.ts$)",
      },
      to: {
        path: "^packages/client-adapters/src/(testing\\.ts$|adapters/__tests__/|.*\\.testHelpers\\.ts$)",
      },
    },
    {
      name: "bindings-name-no-core",
      severity: "error",
      comment:
        "A binding bridges the CONTRACT (@rtc/core-api) to its framework and receives the app already composed — its source names no application core and none of the adapters, so any core can sit behind it; `@rtc/client-core-rxjs` and `@rtc/client-adapters` are a binding's devDependencies. Only a binding's tests compose a real core.",
      from: {
        path: "^packages/(react|solid)-bindings/src",
        pathNot: "(\\.test\\.tsx?$|/__tests__/|/testing/)",
      },
      to: { path: "^packages/client-adapters(-rxjs|-async|-effect)?/" },
    },
    {
      name: "ui-takes-wire-types-only",
      severity: "error",
      comment:
        "The UI side — the three clients, both bindings and the UI contract — may NAME a wire DTO type from @rtc/shared (the Jarvis event and usage types that @rtc/core-api's own interfaces carry), but never import a VALUE from it: the wire protocol and the scripted Jarvis brain stay on the port side of the plug, out of the UI's bundle. Type-only edges are invisible to this graph (tsPreCompilationDeps:false), so every edge this rule sees is a value edge.",
      from: {
        path: "^packages/(client-react|client-solid|client-react-native|react-bindings|solid-bindings|ui-contract)/",
      },
      to: { path: "^packages/shared/" },
    },
    {
      name: "cores-use-core-contract-only-in-tests",
      severity: "error",
      comment:
        "A core imports @rtc/core-contract only from its runner test — the contract is a dev-only tier, never a source dependency of a core.",
      from: {
        path: "^packages/client-core-(rxjs|async|effect)/src",
        pathNot: "\\.test\\.ts$",
      },
      to: { path: "^packages/core-contract/" },
    },
    {
      name: "cores-stay-inner",
      severity: "error",
      comment:
        "The three application cores are siblings. Each may import only ITSELF, core-api, core-logic (the shared stream-free rules), client-adapters (the adapters, from tests only — `cores-take-ports-as-arguments` below keeps them out of production code), core-contract (its runner test), domain, and shared — never a binding, a client, the server, or EACH OTHER, tests included. The `$1` in pathNot is dependency-cruiser group matching against the capture in `from.path`.",
      from: { path: "^packages/(client-core-(?:rxjs|async|effect))/src" },
      to: {
        path: "^packages/",
        pathNot:
          "^packages/($1|client-adapters|core-api|core-contract|core-logic|domain|shared)/",
      },
    },
    {
      name: "cores-take-ports-as-arguments",
      severity: "error",
      comment:
        "A core composes from @rtc/core-logic and its own members, and receives its ports — already built — as `createApp(ports)`'s argument. @rtc/client-adapters (the adapters and port factories) is a core's devDependency, for tests that compose a real core over real adapters (createSimulatorPorts), never a runtime import.",
      from: {
        path: "^packages/client-core-(rxjs|async|effect)/src",
        pathNot: "\\.test\\.tsx?$",
      },
      to: { path: "^packages/client-adapters/" },
    },
    {
      name: "cores-framework-free",
      severity: "error",
      comment:
        "An application core is framework-free: no React/DOM/RN/Solid modules.",
      from: { path: "^packages/client-core-(rxjs|async|effect)/src" },
      to: {
        path: "(^|node_modules/)(react|react-dom|react-native|solid-js)(/|$)",
      },
    },
    {
      name: "core-logic-stays-pure",
      severity: "error",
      comment:
        "@rtc/core-logic is shared by all three application cores: a runtime rxjs import here would put RxJS inside the alternative cores. Type-only imports are allowed (dependencyTypesNot excludes them).",
      from: { path: "^packages/core-logic/src", pathNot: "\\.test\\.ts$" },
      to: {
        // `(^|node_modules/)`: under pnpm's strict install an rxjs import from
        // this package does not RESOLVE (rxjs is not its dependency), and the
        // cruiser records it under its bare name — a `node_modules/` pattern
        // alone passed a probe `import { map } from "rxjs"` green.
        path: "(^|node_modules/)(rxjs|@rx-state)(/|$)",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "core-logic-stays-inner",
      severity: "error",
      comment:
        "@rtc/core-logic may import only itself, core-api (types), domain and shared — an allowlist, so a package added later is forbidden by default. An edge to a core or to client-adapters in particular would be a cycle: all four depend on core-logic.",
      from: { path: "^packages/core-logic/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(core-logic|core-api|domain|shared)/",
      },
    },
    {
      name: "bridge-owns-rxjs",
      severity: "error",
      comment:
        "Outside bridge/, an alternative core may not import rxjs or @rx-state/core at runtime — otherwise it is RxJS with extra steps. Type-only imports are allowed (dependencyTypesNot excludes them).",
      from: {
        path: "^packages/client-core-(async|effect)/src",
        pathNot:
          "^packages/client-core-(async|effect)/src/bridge/|\\.test\\.ts$",
      },
      to: {
        path: "node_modules/(rxjs|@rx-state)/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "effect-port-subscription-owned-by-the-bridge",
      severity: "error",
      comment:
        "`fromObservable` subscribes a port eagerly at call time and must only be reached through a sharedFold's period-scoped `fromPort` (packages/client-core-effect/src/bridge/out.ts). Presenters never import bridge/in.ts directly; `peek`/`peekCurrent` live in bridge/peek.ts for that reason, and `rpc` in `bridge/rpc.ts`.",
      from: {
        path: "^packages/client-core-effect/src",
        pathNot: "^packages/client-core-effect/src/bridge/|\\.test\\.ts$",
      },
      to: { path: "^packages/client-core-effect/src/bridge/in\\.ts$" },
    },
    {
      name: "effect-only-in-client-core-effect",
      severity: "error",
      comment:
        'The Effect runtime is confined to @rtc/client-core-effect — no other package (client-adapters, a binding, a client, the server) may import `effect`; an alternative core is pluggable precisely because its runtime never leaks past its own package boundary. The `to` path matches the BARE specifier as well as the resolved one: under pnpm strict mode a package that has not declared `effect` cannot resolve it, so the leak arrives as `resolved: "effect"` with couldNotResolve — a node_modules-only pattern would be dormant in exactly the case this rule exists to catch.',
      from: { path: "^packages/", pathNot: "^packages/client-core-effect/" },
      to: { path: "^effect(/|$)|node_modules/effect/" },
    },
    {
      name: "react-bindings-no-apps",
      severity: "error",
      comment:
        "@rtc/react-bindings is the React↔RxJS bridge — it may depend only on core-api/domain (+ react), and on the adapters and the RxJS core from its tests (bindings-name-no-core), never on an app or the server.",
      from: { path: "^packages/react-bindings/src" },
      to: {
        path: "^packages/",
        pathNot:
          "^packages/(react-bindings|client-adapters|client-core-rxjs|core-api|domain)/",
      },
    },
    {
      name: "solid-bindings-no-apps",
      severity: "error",
      comment:
        "@rtc/solid-bindings is the Solid↔RxJS bridge (the Solid counterpart of react-bindings) — it may depend only on core-api/domain (+ solid-js/@rx-state/core/rxjs), and on the adapters and the RxJS core from its tests (bindings-name-no-core), never on an app or the server.",
      from: { path: "^packages/solid-bindings/src" },
      to: {
        path: "^packages/",
        pathNot:
          "^packages/(solid-bindings|client-adapters|client-core-rxjs|core-api|domain)/",
      },
    },
    {
      name: "solid-stays-react-free",
      severity: "error",
      comment:
        "Neither @rtc/solid-bindings nor @rtc/client-solid may ever depend on React — the whole point of the Solid bridge is that client-solid never needs react-bindings.",
      from: { path: "^packages/(solid-bindings|client-solid)/src" },
      to: { path: "node_modules/(react|react-dom|react-native)/" },
    },
    {
      name: "react-clients-stay-solid-free",
      severity: "error",
      comment:
        "The mirror of solid-stays-react-free — React clients/bindings must never depend on SolidJS, the framework @rtc/client-solid + @rtc/solid-bindings are built on.",
      from: {
        path: "^packages/(client-react|client-react-native|client-prototype|react-bindings)/src",
      },
      to: { path: "node_modules/solid-js/" },
    },
    {
      name: "clients-never-import-each-other",
      severity: "error",
      comment:
        "The clients are peers composed from the same core — they must never import one another (CLAUDE.md dependency rule).",
      from: {
        path: "^packages/(client-react|client-react-native|client-prototype|client-solid)/src",
      },
      to: {
        path: "^packages/(client-react|client-react-native|client-prototype|client-solid)/",
        pathNot: "^packages/$1/",
      },
    },
    {
      name: "prototype-isolated",
      severity: "error",
      comment:
        "@rtc/client-prototype is a design-comprehension island — react/react-dom only, no @rtc/* imports (CLAUDE.md).",
      from: { path: "^packages/client-prototype/src" },
      to: { path: "^packages/", pathNot: "^packages/client-prototype/" },
    },
  ],
  options: {
    tsPreCompilationDeps: false,
    // Resolution-only config that maps @rtc/<pkg> → packages/<pkg>/src so the
    // package-boundary rules above actually resolve (and therefore enforce)
    // cross-package edges. See tsconfig.depcruise.json for the full rationale.
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    doNotFollow: { path: "node_modules" },
    // The `/dist/` alternative is anchored to `^packages/[^/]+/dist/` — a
    // workspace package's OWN built output — not a bare `/dist/` substring.
    // Unanchored, it also matched node_modules packages whose entry happens
    // to live under a dist/ folder (most do, e.g. dockview-core resolves to
    // .../node_modules/dockview-core/dist/esm/index.js), which silently
    // dropped the edge from the graph before any `to: { path: "node_modules/…" }`
    // rule ever saw it — discovered while adding what is now named
    // dockview-only-in-layout-dockview (originally targeting dockview-core
    // directly, before the swap to the `dockview` entry package — see that
    // rule's own comment), which was a no-op against the unanchored pattern. The
    // same gap had already made no-mcp-sdk-outside-server dormant, since
    // @modelcontextprotocol/sdk resolves under its own dist/ too. The class is
    // general, not specific to those two packages: any rule whose `to` targets
    // a node_modules package that resolves through its own `dist/` (solid-js,
    // rxjs, the MCP SDK, …) was blind before this anchor — react-clients-stay-
    // solid-free (targeting node_modules/solid-js/) among them.
    // `reports/` is git-ignored test output (tests/reports/ plus each
    // package's coverage tiers): a failing e2e run leaves Playwright's
    // bundled trace viewer there, whose minified chunks import each other in
    // a cycle, so `check:deps` went red locally after any failed e2e run.
    exclude: {
      path: "(\\.cache|^packages/[^/]+/dist/|/__screenshots__/|\\.turbo|^(tests|packages/[^/]+)/reports/)",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "node", "default"],
    },
  },
};

export default config;
