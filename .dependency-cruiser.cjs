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
      comment: "@rtc/shared depends only on domain — no other @rtc package.",
      from: { path: "^packages/shared/src" },
      to: { path: "^packages/", pathNot: "^packages/(shared|domain)/" },
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
        "@rtc/client-core is the shared application core — it may depend only on domain/shared, never on bindings, a view-layer leaf, any client, or the server.",
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
    exclude: {
      path: "(\\.cache|/dist/|/__screenshots__/|\\.turbo)",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "node", "default"],
    },
  },
};
