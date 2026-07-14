/** @type {import('dependency-cruiser').IConfiguration} */
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
      comment: "@rtc/domain must not depend on shared/client/server.",
      from: { path: "^packages/domain/src" },
      to: { path: "^packages/(shared|client-react|server)/" },
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
      comment: "@rtc/shared must not depend on client/server.",
      from: { path: "^packages/shared/src" },
      to: { path: "^packages/(client-react|server)/" },
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
        "@rtc/ws-effects is a transport framework — it must not depend on domain/shared/client/server.",
      from: { path: "^packages/ws-effects/src" },
      to: { path: "^packages/(domain|shared|client-react|server)/" },
    },
    {
      name: "devtools-core-stays-pure",
      severity: "error",
      comment:
        "@rtc/devtools-core decorates by structural shape — it must not import any @rtc package.",
      from: { path: "^packages/devtools-core/src" },
      to: {
        path: "^packages/(domain|shared|client-core|client-react|client-react-native|client-prototype|react-bindings|server|ws-effects|devtools-app)/",
      },
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
      name: "motion-core-stays-pure",
      severity: "error",
      comment:
        "@rtc/motion-core is zero-dependency pure view-layer math — it must not depend on domain/shared/client-core/bindings/any client/server/ws-effects.",
      from: { path: "^packages/motion-core/src" },
      to: {
        path: "^packages/(domain|shared|client-core|react-bindings|solid-bindings|client-react|client-react-native|client-prototype|client-solid|server|ws-effects)/",
      },
    },
    {
      name: "ui-contract-stays-neutral",
      severity: "error",
      comment:
        "@rtc/ui-contract is the framework-neutral UI contract harness (shared by client-react and, later, client-solid) — it may depend only on client-core/domain/motion-core/rxjs, never on a concrete client or the server.",
      from: { path: "^packages/ui-contract/src" },
      to: {
        path: "^packages/(shared|client-react|client-react-native|client-prototype|client-solid|react-bindings|solid-bindings|server|ws-effects)/",
      },
    },
    {
      name: "client-core-stays-inner",
      severity: "error",
      comment:
        "@rtc/client-core is the shared application core — it must not depend on bindings, any client, or the server.",
      from: { path: "^packages/client-core/src" },
      to: {
        path: "^packages/(react-bindings|solid-bindings|client-react|client-react-native|client-prototype|client-solid|server)/",
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
        "@rtc/react-bindings is the React↔RxJS bridge — it may depend on client-core/domain/react, never on an app or the server.",
      from: { path: "^packages/react-bindings/src" },
      to: {
        path: "^packages/(client-react|client-react-native|client-prototype|client-solid|server)/",
      },
    },
    {
      name: "solid-bindings-no-apps",
      severity: "error",
      comment:
        "@rtc/solid-bindings is the Solid↔RxJS bridge (the Solid counterpart of react-bindings) — it may depend on client-core/domain/solid-js/@rx-state/core/rxjs, never on an app or the server.",
      from: { path: "^packages/solid-bindings/src" },
      to: {
        path: "^packages/(client-react|client-react-native|client-prototype|client-solid|react-bindings|server)/",
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
      to: {
        path: "^packages/(domain|shared|client-core|react-bindings|client-react|client-react-native|server|ws-effects)/",
      },
    },
  ],
  options: {
    tsPreCompilationDeps: false,
    tsConfig: { fileName: "tsconfig.base.json" },
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
