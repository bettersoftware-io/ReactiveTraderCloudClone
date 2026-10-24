# The Ops rename (B2c PR 1) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename today's "Admin" workspace to **Ops**, everywhere it means the
operations dashboard. Afterwards, "admin" in the code means only the access
level and the guarded workspace that PR 2 adds.

**Architecture:** This is a mechanical rename with no change in behaviour.
- The wire messages, the port and its place in `AppPorts`, the workspace
  tab id and route, the panel id, and the component, spec, page and scenario
  names all move from `admin` to `ops`.
- The rename goes layer by layer, inward first.
- Every task ends with its package-scoped gates green, and the last tasks
  regenerate the goldens whose tab label changed.

**Tech Stack:** TypeScript monorepo (pnpm + turbo): React, Solid, three
application cores, vitest, Playwright goldens.

**Spec:** [../specs/2026-10-18-b2c-users-panel-design.md](../specs/2026-10-18-b2c-users-panel-design.md)
§3 (PR 1), approved 2026-10-24.

**Rulings:** `2026-10-24-ops-rename-rulings.md`, written by the controller
during execution.

## Ruling made while planning (departs from spec §3.2)

**No layout-payload version bump.** The persisted layout parser
(`workspaceLayoutPersistence.ts` `validatePayload`) already throws away the
**whole** payload for an unknown tab key. It does the same for a tree leaf
that is neither in the tab's default tree nor in `docked`
(`isReconciledWithTree`).

- **In PR 1**, a saved `{ v: 1, tabs: { admin: … } }` therefore reads as no
  saved layout. That is exactly what §3.2 wanted.
- **In PR 2**, `admin` is a tab again, but its default tree holds
  `admin-users`. A saved tree holding `admin-dashboard` therefore fails
  reconciliation and is thrown away too.
- **Why not bump the version:** it would also have to move
  `layoutPresetCodec.ts` and `workspaceLayoutWrite.ts` off `v: 1` for no
  gain.
- **What replaces it:** Task 2 pins the behaviour with a test, and PR 2
  re-pins it for its own tree.

## Global Constraints

- **Behaviour is unchanged.** No test changes what it asserts. A test changes
  only the names it spells. The one new test is the saved-layout case in
  Task 2.
- **The rename rule.** An identifier, string, path or prose word becomes
  `ops` / `Ops` / `OPS` when it refers to the operations dashboard.
  - That covers the workspace, its panels, its port (throughput), its
    Jarvis-usage telemetry and its cadence constants.
  - It stays `admin` when it means the **access level** or the account:
    - `AccessLevel`, `access: "admin"`, token claim `a`;
    - `admin@rtc.test`, "Desk Admin", "Desk Administrator", "LEVEL 5 · ADMIN";
    - `role in ('user','admin')`, `/mcp`'s administrator comments,
      `docs/security.md`'s administrator.
  - When in doubt, read the line: is it about the dashboard, or about who
    may do what?
- **Out of scope:**
  - `packages/client-prototype/**` and `docs/design/**`: the delivered
    design, with its own vocabulary. The deviation corpus already maps
    prototype names.
  - `CHANGELOG.md`.
  - Historical records: `docs/superpowers/plans|specs/**` other than this
    plan and its spec, `docs/adr/**` and `docs/research/**`.
  - `spreadMin`: it only matches "admin" case-insensitively.
- **Names (exact):**

  | From | To |
  |---|---|
  | `WorkspaceTab` member `"admin"` | `"ops"` |
  | route slug `admin` | `ops` |
  | tab label "Admin" | "Ops" |
  | panel id `admin-dashboard`, title "Admin" | `ops-dashboard`, "Ops" |
  | `AdminPort` (`ports/adminPort.ts`) | `OpsPort` (`ports/opsPort.ts`) |
  | `AppPorts.admin` | `AppPorts.ops` |
  | `describeAdminPortContract` / `AdminPortContract.ts` | `describeOpsPortContract` / `OpsPortContract.ts` |
  | `createAdminPort` | `createOpsPort` |
  | `CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE`, `SERVER_MSG.ADMIN_JARVIS_USAGE` | `OPS_JARVIS_USAGE_SUBSCRIBE`, `OPS_JARVIS_USAGE` |
  | wire strings `admin.getThroughput`, `admin.setThroughput`, `admin.jarvisUsage.subscribe`, `admin.jarvisUsage` (+ `.response` forms) | `ops.getThroughput`, `ops.setThroughput`, `ops.jarvisUsage.subscribe`, `ops.jarvisUsage` (+ `.response`) |
  | `AdminJarvisUsagePayload` | `OpsJarvisUsagePayload` |
  | server `admin.effects.ts` / `adminEffects`, `adminJarvisUsage.effects.ts` / `adminJarvisUsageEffects` | `ops.effects.ts` / `opsEffects`, `opsJarvisUsage.effects.ts` / `opsJarvisUsageEffects` |
  | domain `telemetry/adminCadence.ts` | `telemetry/opsCadence.ts` (exported constant names follow the rule) |
  | core-logic `admin/adminKpisVm.ts` / `AdminKpiVm` / `AdminKpiKey`, `presenters/adminFolds.ts` | `ops/opsKpisVm.ts` / `OpsKpiVm` / `OpsKpiKey`, `presenters/opsFolds.ts` |
  | async/effect `presenters/admin.ts` | `presenters/ops.ts` |
  | `react-bindings/src/createViewModel.admin.test.ts` | `createViewModel.ops.test.ts` |
  | `client-adapters` `wsRealAdmin.*.test.ts` | `wsRealOps.*.test.ts` |
  | both clients' `src/ui/admin/**` | `src/ui/ops/**`, with `AdminDashboard` / `AdminHead` / `AdminPanel` → `OpsDashboard` / `OpsHead` / `OpsPanel` (files, components, CSS modules, testids) |
  | ui-contract `specs/admin/**`, `shared/pages/admin/**`, `AdminDashboardPage` etc. | `specs/ops/**`, `shared/pages/ops/**`, `OpsDashboardPage` etc. |
  | visual scenario keys `app/admin`, `app/admin-dockview`, `admin/*` | `app/ops`, `app/ops-dockview`, `ops/*` |
  | testid `tab-admin`, `dock-tab-admin-dashboard`, any `admin-*` testid | `tab-ops`, `dock-tab-ops-dashboard`, `ops-*` |
  | e2e `adminIncident` (scenario, spec, presenter steps, fake-timers test), `openAdmin`, `navigateToAdmin`, `tests/specs/admin/` | `opsIncident`, `openOps`, `navigateToOps`, `tests/specs/ops/` |
  | `specs/features/admin/throughput.feature` | `specs/features/ops/throughput.feature` |
  | `DRIVE_TABS` / `DESK_PANEL_ROSTER` key `admin` | `ops` |

  Any other identifier that names the dashboard (`createScriptedAdmin`,
  `ScriptedAdmin`, `createFakeAdmin`, `FakeAdmin*`, `AdminSeed`/`adminSeed`,
  `adminData`, `adminMetrics`, `adminTopology*`, `adminSessions*`,
  `adminEvents`, `adminEventLog`, `adminKpi*`, `adminVm`, `ADMIN_ROOT`,
  `ADMIN_LEAF`, `ADMIN_LIKE`, `AdminHarness`, `AdminDriver`, `*Component`
  forms) gets the same `admin→ops` swap, keeping its case.
- **Moves keep history.** Use `git mv` for every renamed file and directory.
  Golden PNGs that do not show the tab bar also move with `git mv`, so their
  bytes stay the same.
- **Import and lint rules.** One import statement per module. Run
  `pnpm exec biome check --write <files>` before each commit, then
  `pnpm exec eslint <files>` (Biome misses `rtc/newspaper-order`).
- **Never run two builds in this checkout at once.** Rebuild changed
  libraries one at a time in dependency order before running downstream
  tests: `@rtc/domain` → `@rtc/shared` → `@rtc/core-api` → `@rtc/core-logic`
  → `@rtc/client-adapters` → `@rtc/core-contract`. Grep `dist` for a renamed
  export before trusting a 0 s cached build.
- **Whole-repo `pnpm typecheck` is red between tasks by design.** Each task
  names its own gates.
- **No lint suppressions.** On the FINAL tree, run `/rtc:gauntlet full` and
  `pnpm test:e2e`.
- **One PR.** Outward steps (push, workflow dispatch, `gh pr create`,
  `gh pr merge`) each go in their own Bash call, batched at the end.

## Review Focus

1. **A wire string renamed on one side only.** The server would ignore the
   client's `ops.getThroughput` and the throughput slider would load
   forever. → Task 1: `messages.test.ts` asserts the four `ops.*` strings.
   The server effects test drives `CLIENT_MSG.GET_THROUGHPUT` end to end, and
   any literal string in a test is replaced, not kept.
2. **An access-level `admin` renamed by mistake** (the token claim, `AccessLevel`,
   the dev seed `admin@rtc.test`). → Task 4's grep step lists every surviving
   `admin` and the reviewer checks each one against the rule. The server's
   account tests are unchanged and must stay green.
3. **A saved pre-rename layout crashing boot or seeding the wrong tab.** →
   Task 2: a parse test feeds the exact pre-rename shape and expects `null`.
4. **A golden regenerated that should only have moved**, which would hide a
   real pixel change. → Task 5: the moved PNGs are byte-identical. Run
   `git diff --stat -M100%` and confirm that only tab-bar shots show content
   changes.
5. **Jarvis still driving to `admin`.** A drive batch naming `admin` must now
   be refused as an unknown tab, just as `nope` is. → Task 2:
   `driveCommand` parse test case.

## File map

| Area | Files |
|---|---|
| Wire + server | `packages/shared/src/protocol/messages.ts` (+test), `packages/server/src/effects/{ops,opsJarvisUsage}.effects.ts` (+tests), `effects/index.ts`, `services/connectionScope.ts` (comment) |
| Port | `packages/domain/src/ports/opsPort.ts`, `ports/__contracts__/OpsPortContract.ts`, `simulators/ThroughputSimulator.contract.test.ts`, `domain/src/index.ts`; `packages/core-api/src/app.ts`, `adapters.ts` (docs) |
| Adapters | `packages/client-adapters/src/adapters/portFactory.ts` (+test), `WsJarvisUsageAdapter.ts` (+test), `wsRealOps.*.test.ts`, `wsRealRpcReject.errors.test.ts`, `wsRealWorkflowAck.contract.test.ts` |
| Cores | every file in `client-core-rxjs|async|effect/src` that reads `ports.admin`/`AdminPort`; `core-contract/src/harness/scriptedPorts.ts` (+test), `suites/{throughput,portDiscipline,layout,reset,dock,workspaceNav,jarvisDriver,jarvis}.ts`, `harness/workspaceTabs.ts` |
| Tab | `core-api/src/layout.ts`, `core-logic/src/routes/appRoutes.ts` (+test), `layout/defaultLayoutPort.ts`, `layout/workspaceLayoutPersistence.ts` (marker only) + new test, `workspaceDock.ts`, `core-logic/src/ops/**`, `presenters/opsFolds.ts`; `domain/src/jarvis/driveCommand.ts`, `domain/src/telemetry/opsCadence.ts`; `shared/src/jarvis/deskPanels.ts`; `layout-dockview` (tests + comments); RN `buildNativePorts.ts` |
| Web clients | both clients' `src/ui/ops/**`, `shell/chrome/NavTab.tsx`, `HeaderChrome.tsx`, `layout/engine/appPanelRegistry.tsx`, head registry, `App.test.tsx`, `tests/ui/**` fakes; both bindings (docs + test file) |
| UI contract | `packages/ui-contract/src/specs/ops/**`, `shared/pages/ops/**`, `shared/harness/world.ts`, `shared/mount.ts`, `specs/shell/**` that name the tab, `visual/{scenarios,scenarioActions,fixtures,appData}.ts` |
| e2e + tooling | `tests/browser/**`, `tests/presenter/**`, `tests/specs/ops/**`, `specs/features/ops/**`, `tests/scripts/{motion-audit,framework-compare,grep-gates}.ts`, `tests/GHERKIN.md`, `eslint-rules/component-newspaper.test.mts` (fixture names only), `scripts/mutation-check.mts` (example text) |
| Docs | living docs under `docs/` (not `adr/`, `research/`, `superpowers/`, `design/`), `docs/readme/web-admin.jpg` → `web-ops.jpg` + its README reference, `CLAUDE.md` if it names the tab, `packages/client-react/tests/ui/visual/{README,COVERAGE-GAPS}.md` |
| Goldens | `packages/ui-contract/goldens/playwright/__screenshots__/{react,react-local/darwin-arm64,react-local/linux-arm64}/visual.spec.ts/<skin>/` |

---

### Task 1: The wire, the server effects and the port

**Files:** the "Wire + server", "Port", "Adapters" and "Cores" rows of the
file map. Core files change only for the `ports.admin` → `ports.ops` and
`AdminPort` → `OpsPort` spellings.

**Interfaces:**
- Produces `OpsPort` (same members as `AdminPort`: `getThroughput`,
  `setThroughput`), `AppPorts.ops: OpsPort`, `createOpsPort(ws)`,
  `CLIENT_MSG.GET_THROUGHPUT = "ops.getThroughput"`,
  `CLIENT_MSG.SET_THROUGHPUT = "ops.setThroughput"`,
  `CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE = "ops.jarvisUsage.subscribe"`,
  `SERVER_MSG.THROUGHPUT_RESPONSE = "ops.getThroughput.response"`,
  `SERVER_MSG.SET_THROUGHPUT_RESPONSE = "ops.setThroughput.response"`, and
  `SERVER_MSG.OPS_JARVIS_USAGE = "ops.jarvisUsage"`.
- The constant names `GET_THROUGHPUT`, `SET_THROUGHPUT`, `THROUGHPUT_RESPONSE`
  and `SET_THROUGHPUT_RESPONSE` keep their names, because they never said
  "admin". The `// Admin` section comments become `// Ops`.

- [ ] **Step 1: Update `messages.test.ts` first.** It asserts the six new
  strings. Run `pnpm --filter @rtc/shared test -- messages`. Expected: FAIL
  (the old strings).
- [ ] **Step 2: Rename** according to the table: messages, then the domain
  port + contract + simulator test, then `core-api` `AppPorts`, then the
  server effects (`git mv`), then the adapters, the core-contract harness and
  the three cores' reads of the port, then RN `buildNativePorts.ts`. Replace
  every literal `"admin.…"` string in tests with the `ops.…` string or,
  better, the constant.
- [ ] **Step 3: Rebuild in order and run:**
  - `pnpm --filter @rtc/domain build`;
  - `pnpm --filter @rtc/shared build`;
  - `pnpm --filter @rtc/core-api build`;
  - `pnpm --filter @rtc/client-adapters build`;
  - `pnpm --filter @rtc/core-contract build`.

  Then all of these must be green, each started only after the one before it
  finishes:
  - `pnpm --filter @rtc/shared test`;
  - `pnpm --filter @rtc/domain test`;
  - `pnpm --filter @rtc/server test`;
  - `pnpm --filter @rtc/client-adapters test`;
  - the `pnpm … test` of each core package
    (`@rtc/client-core-rxjs`, `@rtc/client-core-async`,
    `@rtc/client-core-effect`);
  - `pnpm --filter @rtc/client-react-native typecheck`.
- [ ] **Step 4: Run the grep check.**
  `rg -n "admin\.(get|set)Throughput|admin\.jarvisUsage|ADMIN_JARVIS|AdminPort|createAdminPort|ports\.admin\b|adminEffects|adminJarvisUsageEffects" packages tests -g '!**/dist/**' -g '!**/node_modules/**' -g '!packages/client-prototype/**'`
  must print nothing.
- [ ] **Step 5: Commit** with the message
  `refactor(ops): the dashboard's port and wire messages are ops, not admin`.

---

### Task 2: The tab, the panel, Jarvis's vocabulary and the core-logic names

**Files:** the "Tab" row of the file map, plus the core-contract suites that
name the tab.

**Interfaces:**
- Consumes `OpsPort` from Task 1.
- Produces:
  - `WorkspaceTab = "fx" | "credit" | "equities" | "ops"`, keeping the
    existing member order with `ops` in place of `admin`;
  - `formatAppRoute({ area: "workspace", tab: "ops" }) === "/ops"`;
  - `parseAppRoute("/admin") === null`;
  - the panel id `ops-dashboard` with title `"Ops"`;
  - `DRIVE_TABS = ["fx", "credit", "equities", "ops"]`;
  - `DESK_PANEL_ROSTER.ops`;
  - `OpsKpiVm`, `OpsKpiKey`, `opsFolds`, and the `opsCadence` exports.

- [ ] **Step 1: Write the failing tests.**
  - `appRoutes.test.ts`: `/ops` parses to the ops tab, and `/admin` parses to
    `null`.
  - `driveCommand` / `parseDriveBatch` test: a `switchTab` naming `"admin"`
    is refused the same way an unknown tab is (reuse the existing
    unknown-tab case's assertion).
  - `workspaceLayoutPersistence` test, named
    `"a layout saved before the Ops rename reads as no saved layout"`: build
    the payload with a fixture factory,
    `{ v: 1, tabs: { fx: <fx default>, admin: { layout: { root: { kind: "panel", panelId: "admin-dashboard" }, maximized: null, collapsed: [] }, docked: [] } } }`
    (match `LayoutState`'s real field set), serialize it with
    `JSON.stringify`, and expect `parseWorkspaceLayout` to return `null`.

  Run `pnpm --filter @rtc/core-logic test` and
  `pnpm --filter @rtc/domain test`. Expected: the new cases FAIL.
- [ ] **Step 2: Rename** according to the table.
  - Files: `core-api/src/layout.ts`; `appRoutes.ts`'s slug table;
    `defaultLayoutPort.ts` (panel, title, `OPS_ROOT`, the `ops:` key);
    `WORKSPACE_TAB_MARKERS`; `workspaceDock.ts` `WORKSPACE_TABS`;
    `driveCommand.ts`; `deskPanels.ts`; `adminCadence.ts` → `opsCadence.ts`
    (`git mv`, and update `domain/src/index.ts`); `core-logic/src/admin/` →
    `src/ops/` and `adminFolds.ts` → `opsFolds.ts` (`git mv`, and update
    `core-logic/src/index.ts`).
  - Then the core-contract suites and harness (`workspaceTabs.ts`,
    `layout`, `reset`, `dock`, `workspaceNav`, `jarvisDriver`, `jarvis`),
    the three cores, `layout-dockview` tests and comments, and the bindings'
    comments and `createViewModel.admin.test.ts` → `createViewModel.ops.test.ts`.
  - **The export snapshot.** If `core-logic` or `domain` has an export-list
    snapshot test, re-pin it with `-u` and confirm the diff shows only the
    renamed names.
- [ ] **Step 3: Rebuild** `@rtc/domain` → `@rtc/shared` → `@rtc/core-api` →
  `@rtc/core-logic` → `@rtc/core-contract`. Then these must all be green:
  - `pnpm --filter @rtc/core-logic test`;
  - `pnpm --filter @rtc/domain test`;
  - `pnpm --filter @rtc/shared test`;
  - the three core packages' `test`;
  - `pnpm --filter @rtc/layout-dockview test`;
  - `pnpm --filter @rtc/react-bindings test`;
  - `pnpm --filter @rtc/solid-bindings test`.
- [ ] **Step 4: Commit** with the message
  `refactor(ops): the workspace tab, route and panel are ops — a pre-rename saved layout reads as none`.

---

### Task 3: Both web clients and the UI contract

**Files:** the "Web clients" and "UI contract" rows of the file map.

**Interfaces:**
- Consumes `WorkspaceTab` `"ops"` and the panel id `ops-dashboard` from Task 2.
- Produces:
  - the testids `tab-ops` and `dock-tab-ops-dashboard`, plus each former
    `admin-*` testid as `ops-*`;
  - `OpsDashboardPage`, `OpsHeadPage` and `OpsPanelPage` (the other pages
    such as `KpiRowPage` keep their names, and only their directory moves);
  - the scenario keys `app/ops`, `app/ops-dockview` and `ops/*`.

- [ ] **Step 1: Move the files.**
  - `git mv` both clients' `src/ui/admin` to `src/ui/ops`, then rename
    `Admin{Dashboard,Head,Panel}{.tsx,.module.css}` to `Ops…`.
  - `git mv` the ui-contract `specs/admin` and `shared/pages/admin`
    directories to `…/ops`, then rename the `Admin*` specs and pages.
- [ ] **Step 2: Update every reference.**
  - The client code: `NavTab.tsx` (`TAB_LABEL.ops = "Ops"` and the local
    union), `HeaderChrome.tsx`, the panel and head registries, `App.tsx`
    and its tests.
  - The UI-contract side: the World and `mount.ts`, every spec that names
    the tab or the testids, `scenarios.ts`, `scenarioActions.ts` (the
    `tab-admin` clicks), and `fixtures.ts` / `appData.ts`.
  - The two clients' `viewModelFromWorld.ts` and `buildFakeViewModel.ts`.
  - The two visual-tier docs.
- [ ] **Step 3: Rebuild and run.** Rebuild `@rtc/ui-contract`, then all of
  these must be green:
  - `pnpm --filter @rtc/ui-contract test` (the scenario drift test);
  - `pnpm --filter @rtc/client-react test`;
  - `pnpm --filter @rtc/client-solid test`;
  - `pnpm --filter @rtc/client-react test:ui:contract`;
  - `pnpm --filter @rtc/client-solid test:ui:contract`;
  - `pnpm --filter @rtc/client-react typecheck`;
  - `pnpm --filter @rtc/client-solid typecheck`.

  The visual tier is red until Task 5, because the goldens still carry the
  old names.
- [ ] **Step 4: Commit** with the message
  `refactor(ops): both web clients and the UI contract say Ops`.

---

### Task 4: e2e, the presenter tier, tooling and docs

**Files:** the "e2e + tooling" and "Docs" rows of the file map.

- [ ] **Step 1: Rename** the e2e files (`git mv`):
  - `adminIncident` → `opsIncident` in the scenario, the Playwright spec,
    the presenter scenario, the steps and the fake-timers test;
  - `tests/specs/admin/incident.feature` → `tests/specs/ops/incident.feature`,
    with its step wording "from the admin panel" → "from the ops panel";
  - `specs/features/admin/throughput.feature` → `specs/features/ops/`.

  Then the page objects (`openOps`, the tab unions), `testids.ts`,
  `theme.spec.ts`/`theme.feature`, `common.ts`/`navigation.ts`, and the
  three scripts (`grep-gates.ts` maps the feature `ops/incident` to the test
  `opsIncident`). In `component-newspaper.test.mts` and
  `mutation-check.mts`, rename the example names (`AdminDashboard` →
  `OpsDashboard`).
- [ ] **Step 2: Update the docs.** Every living doc that calls the dashboard
  "Admin" now says "Ops", including its paths and testids. Rename
  `docs/readme/web-admin.jpg` to `web-ops.jpg` (`git mv`) and fix its
  reference. ADRs, research, plans and specs stay as written.
- [ ] **Step 3: Run the survivor grep.**
  `rg -n -i "admin" packages tests specs scripts eslint-rules docs CLAUDE.md -g '!**/dist/**' -g '!**/node_modules/**' -g '!**/__screenshots__/**' -g '!packages/client-prototype/**' -g '!docs/design/**' -g '!docs/adr/**' -g '!docs/research/**' -g '!docs/superpowers/**' > <scratchpad>/admin-survivors.txt`.
  Every line left must be an access-level or account use under the rule.
  Attach the file's line count and a short classification (for example
  "server accounts: 120, docs/security.md: 14, …") to the task report.
- [ ] **Step 4: Run the checks.** All of these must PASS:
  - `pnpm check:doc-links`;
  - `pnpm --filter @rtc/tests gates`;
  - `pnpm --filter @rtc/tests test:hooks`;
  - `pnpm --filter @rtc/tests test:report`;
  - `pnpm test:rules`;
  - `pnpm --filter @rtc/tests test:presenter`;
  - the Playwright suite for `opsIncident.spec.ts` and `theme.spec.ts`.
- [ ] **Step 5: Commit** with the message
  `refactor(ops): e2e, presenter tier, tooling and docs say Ops`.

---

### Task 5: Goldens — move what only changed name, regenerate what shows the tab

**Files:** the three golden sets.

- [ ] **Step 1: Move** every PNG whose scenario key changed and whose pixels
  cannot have changed, using `git mv`. These are the component-level
  `admin-*` → `ops-*` shots: panel, dashboard, topology, event log, KPI row,
  service health, head, incident, and the Jarvis usage card. Move them in all
  three sets. Then confirm the moves:
  - `git diff --cached -M100% --stat | grep -c "=>"` equals the number moved;
  - `git diff --cached -M100% --diff-filter=M` is empty.
- [ ] **Step 2: Regenerate the local set** for every scenario whose shot shows
  the tab bar, on this Mac:
  `cd packages/client-react && SCENARIO_PATTERN='(app|layout|shell|chrome)/[^_]*__' pnpm test:ui:visual:playwright:react:update`.
  - **Which scenarios show it.** On 2026-10-24 these were the 27 `App`
    scenarios (`app/*`, `layout/fx-docked-panel*`,
    `shell/view-menu-open` and `shell/view-menu-layouts-dockview`) plus
    `chrome/header`. Re-list them from `scenarios.ts` (`componentKey: "App"`
    or `"HeaderChrome"`) before running.
  - **Other `shell/*` shots** without the tab bar regenerate byte-identical,
    and git shows no change for them.
  - **Expected result:** only `react-local/darwin-arm64` PNGs change, and
    only in the tab label.
  - **Check one pair by eye:** `app-fx` classic-dark before and after.
    Nothing but "ADMIN" → "OPS" may differ. A shifted tab bar is fine only if
    the label's width moved it, so say so.
- [ ] **Step 3: Assert both clients against the new set** (no `--update`):
  `pnpm --filter @rtc/client-react test:ui:visual:playwright:react` and
  `pnpm --filter @rtc/client-solid test:ui:visual:playwright:solid`. Both
  must PASS in full.
- [ ] **Step 4: The `linux-arm64` local set.** Regenerate it the way that set
  is maintained (see `packages/client-react/tests/ui/visual/README.md`). If it
  is not regenerable on this machine, record that in the rulings and leave
  its tab-bar shots for the next maintainer of that set.
- [ ] **Step 5: Commit** with the message
  `test(visual): Ops goldens — renamed shots moved byte-for-byte, tab-bar shots regenerated (local)`.
- [ ] **Step 6: Send the user the `app-fx` before/after pair** (classic-dark)
  with `SendUserFile` (spec §3.3).
- [ ] **Step 7 (closing batch, after the push):** dispatch the x86 set
  regeneration in one Bash call, using the same unanchored key prefixes with
  `__`:
  `gh workflow run update-visual-goldens.yml --ref worktree-b2c-users-panel -f scenario_pattern='(app|layout|shell|chrome)/[^_]*__'`.
  - Then `git pull`. Verify that the auto-commit touched only
    `__screenshots__/react/`.
  - The auto-commit is `[skip ci]`, so a real commit (the rulings) must
    follow it.

---

## Close-out (controller)

1. **Final tree.** Run `/rtc:gauntlet full`, then `pnpm test:e2e`.
2. **Whole-branch review** on the most capable model, scoped to: the
   access-level survivors, the wire strings, and the saved-layout test.
3. **Rulings file** `2026-10-24-ops-rename-rulings.md`, committed after the
   golden auto-commit.
4. **Closing batch**, one outward step per Bash call:
   1. push;
   2. dispatch the goldens (Task 5 step 7);
   3. pull and verify;
   4. commit the rulings and push;
   5. `gh pr create`;
   6. watch CI on the head SHA;
   7. check code scanning;
   8. Rule 3 triage;
   9. `gh pr merge --merge`;
   10. confirm with `git merge-base --is-ancestor`.

   **Do not remove the worktree.** PR 2 continues on a fresh branch off the
   merged `main` (see the PR 2 plan's setup).
5. **Tell the user:**
   - **No deploy is needed on its own.** The rename deploys with PR 2.
   - **If they deploy it alone,** the server and both clients must go
     together, because the wire strings changed.
   - **React Native.** Its throughput control needs an EAS Update once it
     ships.

## Self-review

- **Spec §3 coverage.** Every §3.1 bullet is covered:
  - the tab, the slug and the label: Task 2 and Task 3;
  - the panel: Task 2;
  - the directories and components: Task 3;
  - the scenario keys: Task 3 and Task 5;
  - the wire messages and the server effects: Task 1;
  - Jarvis: Task 2;
  - e2e and docs: Task 4;
  - the port (the application-core part): Task 1.

  §3.2 is met without the version bump (the ruling above). For §3.3, the
  survivor grep is Task 4, the gauntlet is the close-out and the user's
  before/after pair is Task 5.
- **Type consistency.** `OpsPort`, `AppPorts.ops`, `createOpsPort`,
  `OPS_JARVIS_USAGE(_SUBSCRIBE)`, `ops-dashboard`, `tab-ops` and `OpsKpiVm` are
  spelled the same in every task.
