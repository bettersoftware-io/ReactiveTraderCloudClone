# The RxJS core in its own package, and `@rtc/client-core` becomes `@rtc/client-adapters` — design

**Date:** 2026-10-04 · **Status:** design for review, not yet planned
**Implements:** [ADR-006](../../adr/ADR-006-pluggable-application-core.md) Follow-up 10.
**Builds on:** the edge surface (ADR-006 Follow-up 9, PR #900), which drew the
cut line this design lifts into package boundaries.

## Intent

**What the user asked for.** `@rtc/client-core/core` says "core" twice in two
different senses, and the three application cores are not named alike: two are
packages (`@rtc/client-core-async`, `@rtc/client-core-effect`) and one is a
subpath of a package that also holds something else. "To be fully consistent
and symmetrical, shouldn't we have the package with the name
`@rtc/client-core-rxjs`?"

**Decided with the user (2026-10-04):**

- **Full cleanup**, not a minimal extraction: the RxJS core gets its own
  package, the UI and the bindings import contract types from `@rtc/core-api`
  directly, and what remains of `@rtc/client-core` is renamed for what it is.
- **The remaining package is `@rtc/client-adapters`.**
- **The pure view helpers move to `@rtc/core-logic`**, not to a new package.
- **Four PRs, consumers first**, each green and revertible alone.
- **No interim rename** of the `./core` subpath: it disappears in PR 3.

**The user's standing preference** (same day): a cleaner and consistent
architecture is worth a modest change even when the measurable gain is small,
unless there is a serious downside.

**Success looks like:**

- Three sibling packages, `@rtc/client-core-rxjs`, `@rtc/client-core-async` and
  `@rtc/client-core-effect`, with the same runtime dependency shape and the
  same dependency rules, none privileged.
- A client reads plainly: types from `@rtc/core-api`, pure functions from
  `@rtc/core-logic`, ports from `@rtc/client-adapters`, a core by dynamic
  import.
- No package named "core" that is not a core. No re-export that exists "so
  existing imports keep working".
- Behaviour, bundle shape and every test result unchanged, except that the
  bundle gate's RxJS marker carries the new package name.

## What the code looks like today (measured on main, 2026-10-04)

`@rtc/client-core` holds two separable things:

| Part | Files (non-test) | What it is |
|---|---|---|
| RxJS core | `composition.ts`, `core.ts`, 70 modules under `presenters/` | The composition root, every presenter class and machine factory |
| Adapters | 13 modules under `adapters/`, plus `wsUrl.ts` | `WsAdapter`, `HttpAuthAdapter`, `RoutingAuthPort`, the Jarvis adapters, the session and data-source stores, `portFactory` |
| Pure view helpers | 6 modules under `blotter/`, `admin/`, `layout/` | Column sort and filters, the admin KPI view models, three layout geometry helpers |
| Pass-through modules | 6 type-only modules | `adapters/{jarvisPort,jarvisUsagePort,sessionStore,IWsAdapter}.ts`, `layout/layoutPresets.ts`, `theme/colorSchemeSource.ts` — each re-exports `@rtc/core-api` types |
| RxJS helpers in the wrong directory | 4 modules | `layout/createLayoutPresets.ts`, `layout/workspacePersistenceWriter.ts`, `adapters/delayedAuthPort.ts`, `adapters/readPreferenceNow.ts` — imported by the composition root, by no UI file |

Outside the package, 273 files import `@rtc/client-core` or
`@rtc/client-core/core`. Classified by where each imported name is truly
defined:

| True home of the name | Kind | Distinct names | Import sites | Files |
|---|---|---|---|---|
| `@rtc/core-api` | type | 79 | 574 | 204 |
| the adapters | value | 17 | 115 | 43 |
| `@rtc/core-logic` | value | 26 | 100 | 56 |
| the RxJS core (`./core`) | value | 23 | 95 | 43 |
| the pure view helpers | type + value | 17 | 64 | 38 |
| `@rtc/shared`, `@rtc/domain` | type | 4 | 19 | 18 |
| `@rtc/core-logic` | type | 8 | 12 | 8 |
| the adapters | type | 3 | 5 | 3 |

Four facts from that table drive the design:

1. **No type a consumer imports is defined by the RxJS core.** All 100 type
   names resolve to `@rtc/core-api`, `@rtc/core-logic`, `@rtc/shared`,
   `@rtc/domain`, the adapters or the view helpers. The UI already depends
   only on the contract; it spells the import through an implementation
   package.
2. **The edge imports nothing from the core**, enforced since #900 by
   dependency-cruiser's `client-core-root-is-the-edge`.
3. **The core needs nothing from the adapters at runtime.** It imports three
   port types from `adapters/` that are `@rtc/core-api` types re-exported, and
   the four RxJS helpers listed above, which are its own.
4. **The alternative cores use `@rtc/client-core` for the adapters only**
   (`createSimulatorPorts`, `InMemorySessionStore`, `createRoutingAuthPort`,
   `InMemoryDataSourceStore`, `pairConnectionPorts`), and only in tests.

One asymmetry to remove: eight presenter modules re-export names from other
packages; the two alternative cores have no such re-export outside their
index.

## Design

### Target packages

| Package | Holds | Runtime dependencies |
|---|---|---|
| `@rtc/core-api` | The contract types. Unchanged. | none |
| `@rtc/core-logic` | The pure rules, plus the six view-helper modules | `domain`, `shared` |
| `@rtc/client-core-rxjs` | The composition root, the 70 presenter and machine modules, the four RxJS helpers | `core-api` (types), `core-logic`, `domain`, `shared`, `rxjs`, `@rx-state/core` |
| `@rtc/client-core-async` | Unchanged | unchanged |
| `@rtc/client-core-effect` | Unchanged | unchanged |
| `@rtc/client-adapters` | The 13 adapter modules and `wsUrl.ts` | `core-api` (types), `core-logic`, `domain`, `shared`, `rxjs` |

`@rtc/client-core` and its `./core` subpath cease to exist. The package count
goes from twenty-five to twenty-six.

**Package surfaces.**

- `@rtc/client-core-rxjs` has one entry point. Its index exports `rxjsCore`,
  `createApp`, `createMachineFactories`, `RXJS_CORE_BRAND` and the presenter
  barrel, which tests and harnesses use to construct a presenter or machine
  directly. It re-exports nothing from another package.
- `@rtc/client-adapters` has one entry point. Its index exports the adapters,
  the port factories, the stores, and the types those modules define
  (`DataSource`, `DataSourceStore`, the `WsAdapter` class type). It re-exports
  nothing from another package.
- `RXJS_CORE_BRAND` becomes `"@rtc/client-core-rxjs:brand"`, so the bundle
  gate's three markers match their package names.

**Who imports what afterwards.**

| Consumer | Types | Pure values | Ports | Core |
|---|---|---|---|---|
| Web clients (`src`) | `core-api` | `core-logic` | `client-adapters` | `import()` of one of three |
| React Native | `core-api` | `core-logic` | `client-adapters` | static import of `client-core-rxjs` |
| `react-bindings`, `solid-bindings` (`src`) | `core-api` | none | none | none |
| `ui-contract` | `core-api` | `core-logic` | `client-adapters` | `client-core-rxjs`, for the two real machines its harness builds |
| The alternative cores' tests | `core-api` | `core-logic` | `client-adapters` (devDependency) | their own |
| Tests anywhere | as their subject | as their subject | `client-adapters` | `client-core-rxjs` |

React Native gains direct dependencies on `core-api` and `core-logic`; the two
web clients, the bindings and `ui-contract` gain `core-logic`. They reach both
today only through the pass-through.

### Dependency rules

Rules that replace today's special cases, all in `.dependency-cruiser.mts`:

| Rule | Says |
|---|---|
| `cores-never-import-each-other` | No `client-core-*` package imports another, in `src` or in tests. Replaces `alt-cores-no-client-core-at-runtime`. |
| `cores-take-ports-as-arguments` | No `client-core-*` `src` file imports `@rtc/client-adapters`. Tests may, for port fixtures. |
| `client-adapters-imports-no-core` | `@rtc/client-adapters` imports no `client-core-*` package. |
| `client-core-rxjs-stays-inner`, `client-core-rxjs-framework-free` | The two existing `client-core` rules, renamed and re-scoped; the alternative cores' equivalents then cover all three alike where their patterns allow. |
| `client-adapters-stays-inner`, `client-adapters-framework-free` | The same two rules for the adapters package. |
| `web-clients-load-cores-lazily` | A web client's `src` reaches a `client-core-*` package only through a dynamic `import()` (dependency-cruiser's `dynamic` attribute). The plan proves the attribute with a probe before relying on it; `check:core-bundle` stays the build-level witness either way. |

`client-core-root-is-the-edge`, the `reachable` rule from #900, is deleted in
PR 3: separate packages make it structural. `bridge-owns-rxjs` and grep gate
43 keep applying to the two alternative cores only; the RxJS core is RxJS
throughout by definition.

### The four PRs

Each PR ends green on the full gauntlet and is revertible without the others.

**PR 1 — consumers import from the defining package; the pass-throughs go.**

- Every import outside the package is rewritten by script to the name's true
  home: 574 type sites to `@rtc/core-api`, 112 sites to `@rtc/core-logic`, 19
  to `@rtc/shared` or `@rtc/domain`. Adapter, helper and `./core` imports stay
  on `@rtc/client-core` for now.
- The script writes the target import style of the planned lint rule: an
  import of types only is `import type { … }`; a mixed import is one block
  with inline `type`. It merges into an existing block from the same module
  rather than adding a second.
- Removed from `@rtc/client-core`: `export * from "@rtc/core-logic"`, the
  `@rtc/core-api` type re-exports, `export type * from "#/presenters/index"`,
  the six pass-through modules, and every cross-package re-export in the eight
  presenter modules. Imports inside the package that went through one of them
  are repointed too.
- Consumers gain the direct dependencies listed above, with tsconfig
  `references` where the package uses them.
- No behaviour change, no file moves. Both public-API snapshots shrink; the
  diff is the record of what left.

**PR 2 — the view helpers move to `@rtc/core-logic`.**

- `blotter/columnSort.ts`, `blotter/filterState.ts`, `admin/adminKpisVm.ts`,
  `layout/lockedWidth.ts`, `layout/maximizeBoundary.ts` and
  `layout/visibleRoot.ts` move with their tests, by `git mv`, into
  `core-logic` directories of the same names. Their 64 import sites follow.
- `@rtc/core-logic`'s charter in the docs widens from "the rules all three
  cores share" to "pure rules, no stream library, shared by the cores and the
  UIs". Its dependency rules are unchanged and already satisfied: the helpers
  import only `@rtc/domain` and `@rtc/core-logic`.

**PR 3 — extract `@rtc/client-core-rxjs`.**

- New package with the full wiring a runtime package needs (below).
- `composition.ts`, the composition tests, `presenters/` with its tests, and
  the four RxJS helpers with their tests move by `git mv`. `core.ts` becomes
  the new package's index. Four tests outside those directories import the
  core today (`core.publicApi.test.ts`, `layout/__tests__/workspaceDock.test.ts`,
  `layout/__tests__/createLayoutPresets.test.ts`,
  `adapters/wsRealJarvis.contract.test.ts`): each moves to the new package,
  or has its core-dependent cases moved there, so that no test left in the
  adapters package imports the core.
- The 95 `@rtc/client-core/core` import sites become `@rtc/client-core-rxjs`,
  including both web clients' `import()` in `coreSelection.ts`, the Vite debug
  aliases and React Native's jest mapper.
- The `./core` subpath export, `core.publicApi.test.ts`'s root-versus-core
  assertions and `client-core-root-is-the-edge` are deleted; the new package
  rules replace them. A public-API snapshot test pins the new package's
  surface.
- The brand string changes; `tests/scripts/lib/coreBundle.ts` and its test
  follow.
- The alternative cores' devDependency on `@rtc/client-core` stays, now
  meaning the adapters only.

**PR 4 — rename `@rtc/client-core` to `@rtc/client-adapters`.**

- The directory, the package name, 120 import sites, tsconfig references and
  paths, knip, the dependency rules, the Vite aliases, the jest mapper, CI
  filters and the scripts that name the package.
- Current docs are rewritten (69 files mention `client-core`; the package
  table in `CLAUDE.md`, §6, §13, §14, §22, §23, the package READMEs).
  Historical records under `docs/superpowers/` are left as written.
- ADR-006 gains an amendment recording the split and strikes Follow-up 10.

### Wiring a new runtime package (PR 3 and PR 4)

Each item was missed at least once before in this repo and is checked off in
the plan, not assumed:

1. `package.json` dependencies and tsconfig `references` in every consumer.
2. A `knip.json` workspace entry.
3. The `tsconfig.depcruise.json` path pair. Without it dependency-cruiser
   resolves the package to `dist/`, which is excluded, and every rule about it
   passes on nothing.
4. `client-react-native/jest.config.js` `moduleNameMapper`.
5. Both web clients' `vite.config.ts` debug alias maps.
6. The package's own dependency rules, with a mutant proving each fires.
7. The package's vitest `include` and `exclude` of `dist/**`.
8. `check:scripts`, `check:react-policies`, `check:manifest-drift` and the CI
   workflow filters that name packages.

## Error handling and risk

This is a restructuring with no runtime behaviour change, so the risks are
structural:

| Risk | Guard |
|---|---|
| A rewritten import changes a value edge into a missing one, or the reverse | Typecheck across every project; type-aware ESLint; the full unit suite |
| An all-inline-type import survives as a runtime import and pulls a core into the eager bundle | The script emits `import type` for type-only imports; `check:core-bundle` after every PR |
| A dependency rule silently matches nothing after a rename | One mutant per new or renamed rule, run with `scripts/mutation-check.mts` |
| The bundle shape shifts (chunk assignment follows static reachability) | Sourcemap attribution before PR 3 and after it; the eager set and the three core chunks must match within noise |
| A deployed build's `/devtools/`, sourcemap aliases or the deploy guard reference the old names | `check:devtools-dist`, the deploy workflow's guard step, and a grep for the old names over non-historical files at the end of PR 4 |
| Main moves under a 273-file PR | PR 1 is generated by a script kept in the PR; on conflict the script is re-run on fresh main rather than merging by hand |

## Testing

- **No new behaviour, so no new behavioural tests.** The existing suites move
  with their subjects and must stay green: the core contract runner for the
  RxJS core, the composition tests, the presenter and machine tests.
- **New tests are structural:** a public-API snapshot for each of the two new
  package surfaces, and the dependency rules above, each proven by a mutant.
- **Per PR:** full gauntlet including the coverage gates. PRs 3 and 4 also run
  the three e2e legs (`test:e2e`, `test:e2e:async`, `test:e2e:effect`) and
  `check:core-bundle`, since they change what the bundler sees. PR 3 re-runs
  the sourcemap attribution.
- **React Native:** its vitest and jest suites, plus an Expo bundle smoke in
  CI, for PRs 1, 3 and 4.
- **One independent reviewer per PR**, with the Minors fixed in the same PR.

## Docs to update

- `CLAUDE.md`: status paragraph, package table, dependency and application
  core rules, the package count.
- `docs/architecture/`: §6 (dependency graph and diagram), §13 (codebase map),
  §14 (composition), §22 and §23 (the cores), §11 (key files).
- `docs/adr/ADR-006`: an amendment, Follow-up 10 struck.
- `docs/dependency-cruiser.md`: the rules table.
- `docs/development.md` and the READMEs of the packages involved.
- `docs/STATUS.md`: this entry moves from "optional" to "designed, not built"
  with this spec, then leaves the page when PR 4 merges.

## Out of scope (recorded, not planned)

- **A coverage gate for the RxJS core.** The two alternative cores have a ≥95%
  gate and the RxJS core has none. Symmetry suggests one; it is a separate
  measurement and a separate PR.
- **The one-import-per-module lint rule and its migration.** Next in the
  agreed order. PR 1 writes its rewrites in that rule's style, which shrinks
  the migration, but does not add the rule.
- **Hot swap without a page reload** (ADR-006 Follow-up 7). After the lint
  rule.
- **React Native on the alternative cores** (ADR-006 Follow-up 4).
