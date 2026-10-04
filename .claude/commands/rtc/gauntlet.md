---
description: Run the local mirror of CI's `checks` job — fast tier by default, `full` for all of it
argument-hint: [full]
allowed-tools: Bash(pnpm:*), Bash(git:*), Read
---

Run the local gate gauntlet. Argument: `$ARGUMENTS` (empty → fast tier, `full` → everything).

## CI's current `checks` step list — compare against the tiers below

!`awk '/^  checks:/,/^  e2e:/' .github/workflows/ci.yml | grep -E "^\s+- name:" | sed 's/.*- name: //' | grep -viE "corepack|store path|cache the|install dependencies|checkout|setup-node"`

**Before running anything**, diff that list against the **known-steps table**
below — a mechanical name-by-name lookup, not a side-by-side impression. For
every step in the list above, find its exact name in the table and note its
tier. Then:

- **Any step name NOT in the table is drift.** Say so loudly, at the top of
  your report, naming the step (`NEW CI STEP, not in the gauntlet: <name>`),
  find its command in `ci.yml`, run it anyway, and tell the user to add it to
  the table and a tier in the same PR. Never rationalise a missing row as "covered
  by something similar" — `check:prototype-shots` and `zizmor` each sat absent
  from the gauntlet that way.
- **Any table row whose step no longer appears in the list** is stale: say so
  (CI dropped or renamed it), and check whether the renamed step is now a new
  name.

Emit the mapping as a compact list only when something is unmapped or stale;
otherwise one line ("all N CI steps mapped").

### Known-steps table

| CI step (exact name) | Where it runs locally |
|---|---|
| Lint + format (Biome) | fast |
| ESLint (AST rules) | fast |
| Custom ESLint rule tests (RuleTester) | fast |
| CSS lint (stylelint) | fast |
| Workflow lint (actionlint) | fast |
| Workflow security lint (zizmor) | fast |
| Docs link check (files + anchors) | fast |
| Presenter manifest drift (web ↔ React Native) | fast |
| Prototype deviation corpus (manifest ↔ tree) | fast |
| Playwright container image tag drift (single-source pin) | fast |
| Version consistency (manypkg + syncpack) | fast |
| Workspace script coverage (every package wired to the gates) | fast |
| React package policies (compiler / memo-ban / react-hooks all explicit) | fast |
| React Compiler coverage | fast |
| Worklet capture safety (RN + motion-core) | fast |
| Pages tooling unit tests | fast |
| E2E harness tooling unit tests | fast |
| Cucumber hooks unit tests | fast |
| Dead code (knip) | fast |
| Dependency graph (cycles + layering) | fast |
| Architecture + supply-chain gates (grep gates + pnpm audit --prod) | fast |
| Typecheck | full |
| Tests (unit) | full |
| Lint-warnings ledger drift (docs/lint-warnings.md) | full |
| ESLint (type-aware rules) | full |
| UI contract coverage gate (≥95%) | full |
| UI contract coverage gate — solid (≥95%, branches ≥85%) | full |
| Devtools coverage gates (core + app, ≥95%, branches ≥85%) | full |
| Alternative-core coverage gates (async + effect, ≥95%, branches ≥85%) | full |
| React Native coverage gate (merged lines ≥95%) | full |
| Build | full |
| Prod /devtools/ bundle check | full |
| Core bundle isolation (every core only in its own lazy chunk) | full |
| Expo bundle smoke (Metro monorepo resolution) | CI-only — Metro monorepo resolution belongs on a clean runner |

Setup steps (Enable Corepack, Resolve pnpm store path, Cache the pnpm store,
Install dependencies, checkout, setup-node) are **infra** — the `!` block above
already filters them out, so they never appear and never false-flag.

Only one step may be skipped locally: **Expo bundle smoke**. The fast tier
skips the `full` rows by design. Anything else unmapped is drift, not a
judgement call.

The list is scoped to the **`checks` job only**. An earlier version grepped the
whole workflow and so flagged the three `e2e`-job steps (`Install Playwright
Chromium…`, `e2e suite…`, `Upload e2e artifacts…`) as unknown gates on *every*
run. A drift check that always fires is one you learn to ignore — which is
exactly the failure it exists to prevent.

## Fast tier — default, ~50s, no build required

> **Adding or removing a gate below?** `CLAUDE.md`'s `/rtc:gauntlet` row states
> the fast-gate count in prose and nothing verifies it — it has already gone
> stale twice (14 → 15 → 18 → 19 → 20 → 21). Update it in the same commit.

Run in this order and stop reporting nothing until all have run (run them all
even if one fails — a single command's failure is not a reason to skip the rest):

```bash
pnpm exec biome ci --error-on-warnings . # format + import-sort + lint (warnings fail too)
pnpm lint:eslint                        # AST rules
pnpm test:rules                         # custom rule RuleTester suite
pnpm lint:css                           # stylelint
pnpm lint:actions                       # actionlint
pnpm lint:actions:security              # zizmor (offline audits unless GH_TOKEN is set)
pnpm check:doc-links                    # md links + anchors
pnpm check:manifest-drift               # presenter manifest, web ↔ RN
pnpm check:prototype-shots              # prototype deviation corpus, manifest ↔ tree
pnpm check:image-tag-drift              # Playwright image pin
pnpm check:versions                     # manypkg + syncpack
pnpm check:scripts                      # every package wired to the gates
pnpm check:react-policies               # compiler / memo-ban / react-hooks policy per React pkg
pnpm check:compiler                     # React Compiler coverage (de-memoized files)
pnpm check:worklet-order                # worklet capture safety (RN + motion-core)
pnpm --filter @rtc/tests test:pages     # pages tooling units
pnpm --filter @rtc/tests test:report    # e2e harness tooling units (report render, core selection)
pnpm --filter @rtc/tests test:hooks     # cucumber hooks units
pnpm lint:dead                          # knip
pnpm check:deps                         # dep-cruiser cycles + layering
pnpm --filter @rtc/tests gates          # grep gates + pnpm audit --prod
```

**`pnpm exec biome ci .` is not the same as `pnpm lint`.** The local `lint`
script is lint-only; CI runs `biome ci`, which additionally enforces formatting
and import ordering. Biome-clean locally has passed while CI went red on exactly
this difference — always run the `ci` form here.

## Full tier — `full` only, ~8 min plus a cold build

Everything above, then:

```bash
pnpm typecheck
pnpm test                                                   # unit, the long pole (~2.5 min)
pnpm check:lint-warnings-drift                              # re-runs ESLint; slower than it looks
pnpm lint:eslint:types                                      # type-aware rules
pnpm --filter @rtc/client-react test:ui:contract:coverage   # ≥95%
pnpm --filter @rtc/client-solid test:ui:contract:coverage   # ≥95%, branches ≥85%
pnpm --filter @rtc/devtools-core test:coverage               # ≥95%, branches ≥85%
pnpm --filter @rtc/devtools-app test:coverage                # ≥95%, branches ≥85%
pnpm --filter @rtc/client-core-async test:coverage          # Alternative-core coverage gates (async) — ≥95%, branches ≥85%
pnpm --filter @rtc/client-core-effect test:coverage         # Alternative-core coverage gates (effect) — ≥95%, branches ≥85%
pnpm --filter @rtc/client-react-native test:coverage:gate   # React Native coverage gate — merged lines ≥95% (jest ∪ vitest)
pnpm build
pnpm check:devtools-dist                                    # REQUIRES the build above
pnpm check:core-bundle                                      # Core bundle isolation (alternative cores only in their own lazy chunks) — REQUIRES the build above, ~1 min
```

`check:devtools-dist` asserts `packages/client-react/dist/devtools/index.html`
exists, so it can only run after `pnpm build` — never hoist it into the fast tier.
`check:core-bundle` likewise requires the build above: it builds each web
client ONCE and asserts the eager set (both pages' entry scripts +
modulepreload hints) carries only the rxjs marker while the async and effect
cores each sit in exactly one lazy chunk — the runtime core switch ships all
three cores per build, so no build is ever a single-core build anymore. The
alt-core contract runners themselves
(`composition.coreContract.test.ts`, each core's own `coreContract.test.ts`)
are already covered by the plain `pnpm test` above — only their ≥95%
coverage gate needs a dedicated line, mirroring the devtools coverage gates.

**Not included, deliberately:** `e2e` is a separate CI job, not part of `checks`,
and adds many minutes. Run `pnpm test:e2e` explicitly when you want it. The
**Expo bundle smoke** step is also skipped locally — it is a Metro
monorepo-resolution check that belongs on a clean CI runner.

## Sibling-worktree false reds

This repo keeps live worktrees under `.claude/worktrees/`. Lint tasks run from
the **primary checkout** glob into them, so a failure can be reported for a file
that belongs to another session's branch, not yours.

Before reporting any lint failure, check whether its path contains
`/.claude/worktrees/`. If it does, it is **not your failure** — say so explicitly
rather than trying to fix it, and never edit a file under another worktree.

## Reporting

One line per gate: name, pass/fail, and the wall time if notable. Then:

- If everything passed, say so in one line. Do not pad it.
- If anything failed, lead with the failures, quote the actionable part of the
  output (not the whole log), and state clearly whether each is genuinely yours
  or a sibling-worktree artefact.
- If you ran the fast tier, close by naming what `full` would additionally cover,
  so a green fast run is never mistaken for a green CI.
