/** @type {import('dependency-cruiser').IConfiguration} */
//
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
module.exports = {
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
        "@rtc/agent-tools is the framework-neutral Jarvis desk-tool package — it may depend only on domain (+ rxjs), never on shared, client-core, a client, bindings, or the server.",
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
        "@rtc/ui-contract is the framework-neutral UI contract harness (shared by client-react and client-solid) — it may depend only on client-core/domain/motion-core, never on a concrete client, a binding, or the server.",
      from: { path: "^packages/ui-contract/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(ui-contract|client-core|domain|motion-core)/",
      },
    },
    {
      name: "client-core-stays-inner",
      severity: "error",
      comment:
        "@rtc/client-core is the shared application core — it may depend only on domain/shared, never on bindings, any client, or the server.",
      from: { path: "^packages/client-core/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(client-core|domain|shared)/",
      },
    },
    {
      name: "client-core-framework-free",
      severity: "error",
      comment:
        "@rtc/client-core is framework-free by contract (its README's headline claim) — no React/DOM/RN modules.",
      from: { path: "^packages/client-core/src" },
      to: { path: "node_modules/(react|react-dom|react-native)/" },
    },
    {
      name: "react-bindings-no-apps",
      severity: "error",
      comment:
        "@rtc/react-bindings is the React↔RxJS bridge — it may depend only on client-core/domain (+ react), never on an app or the server.",
      from: { path: "^packages/react-bindings/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(react-bindings|client-core|domain)/",
      },
    },
    {
      name: "solid-bindings-no-apps",
      severity: "error",
      comment:
        "@rtc/solid-bindings is the Solid↔RxJS bridge (the Solid counterpart of react-bindings) — it may depend only on client-core/domain (+ solid-js/@rx-state/core/rxjs), never on an app or the server.",
      from: { path: "^packages/solid-bindings/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(solid-bindings|client-core|domain)/",
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
    exclude: {
      path: "(\\.cache|^packages/[^/]+/dist/|/__screenshots__/|\\.turbo)",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "node", "default"],
    },
  },
};
