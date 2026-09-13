# TypeScript 7 — the dual install

**Since 2026-09-13 the repo compiles and typechecks with TypeScript 7 (the
Go-native `tsc`) while the `typescript` package name still resolves to the
TypeScript 6 JavaScript API.** Both live in every manifest that declares
TypeScript (`package.json`, `tests/package.json`,
`packages/client-react-native/package.json`):

```jsonc
"typescript":        "npm:@typescript/typescript6@^6.0.2",  // the 6.x JS API, bin: tsc6
"@typescript/native": "npm:typescript@^7.0.2",              // the Go compiler, bin: tsc
```

| you run / import | you get | why |
|---|---|---|
| `tsc` (every `build` / `typecheck` / `dev` script, 43 of them) | **7.0.x, the Go binary** | the `typescript@7` package's only bin is `tsc`; pnpm links it from the `@typescript/native` alias |
| `tsc6` | 6.0.x, the JS compiler | the `@typescript/typescript6` package's only bin is `tsc6`; kept for parity checks |
| `require("typescript")` / `import "typescript"` | **the 6.0.x API** (`ts.version === "6.0.3"`) | `@typescript/typescript6` is Microsoft's repackaging of TS 6 under a different name, published precisely for this arrangement |

No script changed. The 18 `tsc --build && tsc-alias -p tsconfig.json` library
builds, the 25 `tsc --noEmit` typechecks (including the `--tsBuildInfoFile
.turbo/typecheck.tsbuildinfo` variant), the `tsc --build --watch` dev loops and
the `client-react` `tsc -p tsconfig.types.json --noCheck` declaration pass all
run unchanged on the native compiler.

## Why not a plain `^6 → ^7` bump

TypeScript 7.0 (GA 2026-07-08) **ships no programmatic API** — the
announcement says so outright: *"TypeScript 7.0 does not ship with an API. We
expect TypeScript 7.1 to ship with a new (and different) API."* The package's
`main` is gone; `require("typescript")` fails with `MODULE_NOT_FOUND` when
`typescript@7` sits under that name. The team's sanctioned bridge is the
`@typescript/typescript6` package installed *as* `typescript`, which is what
this repo does.

Three of our CI gates need that API:

| tool | what it needs the API for | evidence |
|---|---|---|
| `typescript-eslint` 8.x (the type-aware ESLint gate, `lint:eslint:types`) | it *is* a TypeScript program wrapper — 44 `import "typescript"` sites in `typescript-estree`; peer range `>=4.8.4 <6.1.0` | the upstream TS 7 issue ([#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)) is open with no timeline; the fast-path alternative is `tsgolint` under Oxlint, a different linter |
| `dependency-cruiser` 18.x (`check:deps`, every package-boundary rule) | it parses `.ts` through `tryImportAvailable("typescript")` (falls back to `@swc/core` only if that is installed) and reads `tsconfig.depcruise.json` through the TS API | that tsconfig still uses `baseUrl`, which `tsc` 7 rejects (`TS5102: Option 'baseUrl' has been removed`) — harmless today because only the 6.x API ever reads it |
| Expo SDK 57 (`@expo/cli`, the RN client) | `app.config.ts` is evaluated through the TS API (`transpileModule`) | with `typescript@7` installed it crashed (`expo/expo#47627`); the fix (`expo/expo#47759`, merged 2026-07-21) makes it *fault-tolerant* and states "this does not imply TypeScript v7 support"; `expo doctor` expects `~6.0.3` |

Everything else in the toolchain never touches the API and was unaffected:
`knip` (oxc-parser), Vite / Vitest / `tsx` (esbuild + oxc), `tsc-alias` (reads
the tsconfig JSON itself; verified to rewrite `#/` aliases in TS 7 output
identically), Biome, `jest-expo` (Babel).

## What was measured before switching (2026-09-13, arm64 Mac, TS 6.0.3 vs 7.0.2)

Every number below is from this repo, not a vendor benchmark.

| check | TS 6.0.3 | TS 7.0.2 |
|---|---|---|
| sequential `tsc --noEmit` over all 25 projects | 21.9 s | **4.7 s** |
| `client-react` alone | 2.29 s | 0.29 s |
| `client-react-native` alone (`expo/tsconfig.base`) | 3.59 s | 0.59 s |
| `server` alone | 1.43 s | 0.29 s |
| `pnpm turbo run typecheck --force` (45 tasks, parallel) | 28.6 s wall | *not re-measured pre-switch; the sequential sum above is the honest comparison* |
| diagnostics divergence, all 25 projects after a full build | 0 errors | 0 errors — identical |
| `@rtc/domain` emit + `tsc-alias`, diffed against the TS 6 `dist/` | baseline | `.js` and `.d.ts` **byte-identical**; only `.map` files differ |

Config needed no migration: `tsconfig.base.json` already sits on the 7.0
defaults (`moduleResolution: "bundler"`, `target: ES2022`, `esModuleInterop:
true`, `verbatimModuleSyntax`, `isolatedModules`). The one 7.0-removed option
in the tree is `baseUrl` in `tsconfig.depcruise.json`, which `tsc` never
reads (see the table above). The Linux x64 binary ships as an optional
dependency, so CI runners and the emulated linux/amd64 golden container are
covered.

## Things that look wrong but are correct

- **`pnpm outdated` / Renovate show `typescript` at 6.x.** That row is the
  `@typescript/typescript6` alias; it is *supposed* to stay on 6. The 7.x line
  is the `@typescript/native` row. Renovate groups both (`typescript`
  packageRule in `.github/renovate.json5`).
- **`knip --workspace .` reports `@typescript/native` as unused; the full
  `pnpm lint:dead` run (what CI executes) does not.** No root script calls
  `tsc` directly (root runs `turbo run typecheck`), so a root-scoped run sees
  no consumer; the full run credits every workspace `tsc` script to the alias
  that provides that bin. Nothing is ignored in `knip.json` for this.
- **WebStorm / VS Code "workspace TypeScript" is 6.x.** The IDE language
  service resolves `node_modules/typescript`, which is the 6.x API — exactly
  what those services expect (they cannot load 7.0, which has no API). The
  native TS 7 language server is a separate opt-in (VS Code: the *TypeScript
  Native Preview* extension) and is independent of this install.
- **`tsc6` exists.** It is not used by any script; it is there so a suspected
  compiler difference can be reproduced in seconds: `pnpm exec tsc6 --noEmit`
  next to `pnpm exec tsc --noEmit` in the same package.

## Exit plan — moving fully off TypeScript 6

Tracked in [STATUS.md](STATUS.md) ("Move fully off TypeScript 6"). All of the
following must be true before `typescript` can point at 7.x and the alias be
deleted:

1. TypeScript 7.1 ships its new API and `typescript-eslint` releases a version
   whose peer range admits it (or the type-aware gate is re-homed on
   `tsgolint`/Oxlint — a separate decision, since it changes the linter).
2. `dependency-cruiser` parses `.ts` through that API, or we add `@swc/core`
   as its transpiler and drop `baseUrl` from `tsconfig.depcruise.json` in
   favour of `paths: { "*": ["./*"] }`.
3. Expo declares TypeScript 7 support (SDK 58+; SDK 57 expects `~6.0.3`).

When that lands: set `"typescript": "^7"` in the three manifests, delete the
`@typescript/native` lines and the Renovate `typescript` group, and delete this
section.

## Sources

- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [typescript-eslint · Use TS 7 for type information (#10940)](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
- [expo/expo · expo doesn't compile `app.config.ts` when using typescript 7 (#47627)](https://github.com/expo/expo/issues/47627)
- [expo/expo · `@expo/require-utils` fault tolerance for TS 7 (#47759)](https://github.com/expo/expo/pull/47759)
