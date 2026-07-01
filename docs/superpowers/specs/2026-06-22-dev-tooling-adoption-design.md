# Dev tooling adoption — design

**Status:** approved (2026-06-22)

Companion to [`docs/tooling-roadmap.md`](../../tooling-roadmap.md), which is the
evaluation + status tracker. This spec is the **design for actually adopting**
the recommended tooling. The roadmap explains *why* each tool; this explains
*what we build and in what order*.

## Goal

Adopt the full recommended static-analysis tool set, drive every new check to
zero findings, and make each one **blocking in CI and runnable locally** — then
flip the roadmap's status boxes to ✅.

## Decisions locked in brainstorming

1. **Scope:** all Adopt items **plus** ESLint (the Conditional item). Stylelint
   stays on Hold; husky/markdownlint/commitlint stay Rejected.
2. **ESLint adopted now**, and it **subsumes the custom rules** — see §"ESLint
   owns the custom rules" below. **The GritQL plugins are NOT built** (they would
   double-enforce the same shapes). The validated GritQL snippets in the roadmap
   become reference material only.
3. **Both** `manypkg` **and** `syncpack` are adopted (this repo is
   exploratory; a production repo would pick one). They overlap on version
   alignment — accepted.
4. **Gates: block everything.** Every new check is blocking from the start;
   reaching that means fixing all findings as part of this work.
5. **Execution:** subagent-driven-development on a feature branch.

## Global constraints

Every task implicitly inherits these:

- **Biome stays the sole formatter + correctness linter.** Any second linter
  (ESLint) enables **only non-overlapping rules**; `eslint-config-prettier` (or
  simply not enabling layout rules) guarantees zero formatting overlap.
- **No new findings left unsuppressed, no rule disables to hide real issues.**
  Mirrors the existing `biome.jsonc` "zero findings, no disables" policy.
- **Do not regress existing gates:** after every wave, `pnpm exec biome ci .`,
  `pnpm typecheck`, `pnpm test`, the ui:contract coverage gate, `pnpm build`,
  the `@rtc/tests gates` script, the visual tier, and e2e all stay green.
- **Visual goldens MUST NOT be regenerated** (`--update` forbidden). Style-only
  source edits must leave rendered output identical; prove it by re-running the
  visual tier.
- **Contract spec files are behavior-frozen** (only import specifiers may
  change). Lint them, but apply only non-behavioral autofixes and re-run the
  contract suite to prove green; exclude any file a rule would force a
  behavioral change on.
- `@rtc/domain` may depend only on `rxjs` at runtime.
- `dist/` is a mounted volume — never `rm -rf` it (`find <dir> -mindepth 1 -delete`).
- Work on a feature branch, not directly on `main`. Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- New checks wire into the `checks` job in `.github/workflows/ci.yml` as
  blocking steps (or into the `@rtc/tests` `gates` script), and each gets a root
  `package.json` script so it runs locally with the same config.

## ESLint owns the custom rules

ESLint is adopted, so the four roadmap GritQL rules are implemented as ESLint
rules instead (structural, autofix-capable, and ESLint can additionally do
func-style + blank-line, which GritQL cannot):

| Intent | ESLint rule |
|---|---|
| No inline object **return** type | `no-restricted-syntax` w/ `TSTypeLiteral` selector in return position |
| No arrow implicit return | `arrow-body-style: ["error","always"]` |
| No anonymous function expression | `func-names: ["error","always"]` |
| Destructure `useHooks()` (forbid whole-object bind) | `no-restricted-syntax`: `VariableDeclarator[init.callee.name="useHooks"][id.type="Identifier"]` |
| Forbid chained `useHooks().useX()` *(added 2026-06-26)* | `no-restricted-syntax`: `MemberExpression[object.callee.name="useHooks"]` |
| Prefer function declarations | `func-style: ["error","declaration",{allowArrowFunctions:false}]` |
| Exactly one blank line between blocks | `padding-line-between-statements` + `lines-between-class-members` |

## Architecture / sequencing — risk-graded waves

Easy/low-blast tools first; the source-editing ESLint sweep last. Each wave ends
**green + blocking + committed**. Every wave begins with a **discovery step**
that prints the exact finding count, so fix scope is known before fixing; if a
count is unexpectedly large or structural, pause and report before sweeping.

### Wave A — config + trivial fix (low risk)

- **actionlint** — lint `.github/workflows/*.yml`. Local script + blocking CI step.
- **manypkg** — `manypkg check`, zero-config. Local script + blocking.
- **syncpack** — `syncpack lint` for **version alignment only**; formatting
  check OFF (must not reorder the deliberately-ordered scripts); configure to
  ignore the private-root missing-version false positive. Local script + blocking.
- **Fix:** align `@rtc/tests` `tsx@^4.19.0` → `^4` (surfaced by both version tools).

### Wave B — knip

Install, declare entry points (so barrel/public-API exports aren't false
positives), baseline, **fix all** genuinely unused files/exports/deps. Local
`lint:dead` script + blocking CI step.

### Wave C — dependency-cruiser

Config: `no-circular` configured to **exclude `import type` edges** (proven
necessary — the only 4 "cycles" are type-only), plus inward-only layering rules
(`domain` cannot import `shared`/`client`/`server`; `shared` cannot import
`client`/`server`; `client`/`server` never import each other). Resolve `#/` +
`@rtc/*` via tsconfig/enhanced-resolve. Verify it passes (0 real cycles known),
then make blocking. Local `check:deps` script.

### Wave D — ESLint (largest; two sub-steps)

- **D1 — AST tier (no type info, fast):** scaffold the monorepo-scoped flat
  config (`eslint.config.js`), `eslint-config-prettier`, import resolver for
  `#/` + `@rtc/*`. Enable the AST rules from the table above. Baseline → **fix
  all** (the source sweep) → blocking, local `lint:eslint` + CI.
- **D2 — type-aware tier (slower):** separate opt-in script
  (`lint:eslint:types`) that builds the TS program — `no-floating-promises`,
  `no-misused-promises`, `switch-exhaustiveness-check`. Baseline → fix all →
  blocking.

Both tiers honor the frozen-spec and visual-golden guardrails above.

## Components / files touched

- New: `eslint.config.js`, `.dependency-cruiser.cjs`, `.syncpackrc`, knip config
  (`knip.json` or package.json key), root `package.json` scripts
  (`lint:eslint`, `lint:eslint:types`, `lint:dead`, `check:deps`,
  `check:versions`, `lint:actions`), devDependencies for each tool.
- Modified: `.github/workflows/ci.yml` (new blocking steps in `checks`), source
  files fixed by the ESLint sweep, `tests/package.json` (tsx), possibly per-pkg
  `package.json` (version alignment), `docs/tooling-roadmap.md` (status → ✅).

## Testing / verification

- Each tool: its own check passes at zero findings (the gate itself is the test).
- After each wave: full existing-gate suite stays green (Biome ci, typecheck,
  test, ui:contract coverage, build, `@rtc/tests gates`, visual, e2e).
- After the ESLint source sweep specifically: re-run the **visual tier** (no
  `--update`) and the **contract suite** to prove no behavioral/visual drift.

## Success criteria

- actionlint, manypkg, syncpack, knip, dependency-cruiser, ESLint (AST +
  type-aware) all installed, configured, **zero findings**, **blocking in CI**,
  and runnable locally off the same config.
- GritQL plugins deliberately not built (rules live in ESLint).
- All existing gates still green; goldens untouched.
- `docs/tooling-roadmap.md` statuses updated (adopted → ✅; GritQL item annotated
  as absorbed into ESLint; Stylelint/husky/etc. unchanged).

## Out of scope

Stylelint (Hold), husky/lint-staged, markdownlint, commitlint, publint/attw,
depcheck, the React Compiler. Promotion of any *existing* report-only check is
unrelated. No unrelated refactoring during the ESLint sweep — autofixes +
minimal manual edits to satisfy rules only.
