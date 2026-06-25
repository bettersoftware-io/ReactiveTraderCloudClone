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
