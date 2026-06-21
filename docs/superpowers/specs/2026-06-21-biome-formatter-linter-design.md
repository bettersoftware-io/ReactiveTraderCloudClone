# Biome Formatter + Linter — Design

**Date:** 2026-06-21
**Status:** Approved (design); ready for implementation plan

## Goal

Introduce [Biome](https://biomejs.dev) `2.5.0` as the monorepo's single
formatter **and** linter, with the recommended rule set explicitly enabled,
conform the existing (currently un-linted, un-formatted) codebase to it, and
enforce it as a blocking CI gate — all while honouring the repo's
supply-chain cooldown policy.

## Context (current state)

- **No existing lint/format tooling**: no ESLint, Prettier, Biome, or
  `.editorconfig`. The root `package.json` has a `lint` script
  (`turbo run lint`) and `turbo.json` has an empty `lint` task, but **no
  package defines a `lint` script**, so `pnpm lint` is currently a no-op.
- **Workspaces** (pnpm + Turborepo): `@rtc/domain`, `@rtc/shared`,
  `@rtc/client-react`, `@rtc/server`, `@rtc/tests`. Node 26, pnpm 11.7.0,
  Turbo ^2.4, TypeScript ^6.
- **Supply-chain cooldown** is enforced in two places and must be respected:
  - `pnpm-workspace.yaml`: `minimumReleaseAge: 1440` (24h).
  - `.github/renovate.json5`: `minimumReleaseAge: "1 day"`.
  - CI runs `pnpm install --frozen-lockfile`, which rejects any dependency
    version published fewer than 24h ago. "Latest Biome" therefore means
    **the newest version published ≥24h ago**.
- **`allowBuilds` allowlist** (pnpm 11 strictDepBuilds) currently permits only
  `cypress` and `esbuild` to run install scripts.
- The repo recently completed a CSS Modules migration with **frozen visual
  goldens** — relevant because Biome v2 also formats/lints CSS.

## Key facts established

- **`@biomejs/biome@2.5.0`** is the current `latest` dist-tag, published
  ~217h before this design — comfortably past the 24h cooldown, so it is
  installable as-is. No version downgrade required.
- **Biome 2.5.0 declares no install scripts.** Its platform binary ships via
  plain `optionalDependencies` (`@biomejs/cli-linux-x64`, `@biomejs/cli-darwin-arm64`,
  …), which pnpm's strictDepBuilds allowlist does **not** gate. Therefore
  **no `allowBuilds` entry and no `pnpm-workspace.yaml` change are needed.**

## Decisions (resolved with the user)

1. **Apply to existing code: format + safe autofixes now.** Run
   `biome check --write .` across the repo (format + safe lint fixes +
   import-organize), commit it, then triage remaining non-autofixable lint
   findings. Result: a clean slate so CI can gate green.
2. **CSS is in scope.** Biome formats/lints `.css` and `.module.css` too.
   Formatting is whitespace-only and does not change computed styles, so the
   frozen visual goldens remain valid.
3. **CI gate is blocking.** Add a `biome ci .` step to the existing `checks`
   job that fails the build on any format/lint/assist violation.

## Design

### 1. Dependency

- Add `@biomejs/biome` **pinned exactly to `2.5.0`** (not `^2.5.0`) as a
  single **root** `devDependency` (`pnpm add -Dw @biomejs/biome@2.5.0`).
  Exact pinning is Biome's own recommendation: a caret bump can silently
  change formatting output and desynchronise local vs CI results.
- No `allowBuilds` change. No `pnpm-workspace.yaml` change.
- Renovate already manages dev deps under the same 24h cooldown; no special
  `packageRule` is needed. The exact pin must be preserved (Renovate will
  propose pinned bumps after the cooldown).

### 2. `biome.json` (repo root, single config)

Configuration intent (exact schema keys finalised during implementation
against the 2.5.0 schema):

- **`$schema`** pinned to the 2.5.0 schema URL.
- **VCS-aware**: enabled, git client, `useIgnoreFile: true` (respect
  `.gitignore`).
- **Ignored paths** (in addition to `.gitignore`): `**/dist`, `**/reports`,
  `**/coverage`, `**/__screenshots__`, `**/*.png`, `pnpm-lock.yaml`,
  `**/.turbo`, `**/*.json5` (Biome does not parse JSON5 — this exempts
  `renovate.json5`). `node_modules` is ignored by Biome by default.
- **Formatter**: `indentStyle: space`, `indentWidth: 2`, `lineWidth: 80`,
  `lineEnding: lf` — matching the existing code style to minimise churn.
- **JavaScript/TypeScript formatter**: `quoteStyle: double`,
  `semicolons: always`, `trailingCommas: all` — all consistent with the
  current code.
- **Linter**: `rules.recommended: true` — explicitly enabled.
- **CSS**: formatter + linter enabled.
- **Assist**: `organizeImports` enabled (part of Biome's recommended assist);
  applied repo-wide during the conform pass.

### 3. Root scripts (`package.json`)

- `format`: `biome format --write .`
- `lint`: `biome lint .` (replaces the no-op `turbo run lint`)
- `check`: `biome check .` (read-only: format + lint + assist)
- `check:fix`: `biome check --write .`

The now-orphaned empty `lint` task is removed from `turbo.json`. Biome's
single-binary speed makes turbo's per-package task graph unnecessary for it.

### 4. Conform the existing tree

1. `biome check --write .` once — formats, applies safe lint fixes, organises
   imports across the whole repo. Commit.
2. `biome check .` — surface remaining non-autofixable lint findings.
3. Triage each finding: fix the genuine issues. **If a recommended rule would
   need to be disabled to reach green, that is a deviation from "all
   recommended rules" and must be brought back to the user for sign-off,
   documented inline in `biome.json` with the reason.** No silent rule
   disables.

### 5. CI

- Add a blocking step to the `checks` job in `.github/workflows/ci.yml`:
  **`biome ci .`** (the no-write, CI-optimised command covering format + lint
  + assist). Placed as an early fast gate after dependency install.
- Adding the dependency updates `pnpm-lock.yaml`, which must be committed (CI
  uses `--frozen-lockfile`). The Linux x64 CLI binary resolves on the ubuntu
  runner via optional deps.

### 6. Verification / safety net

The mass reformat + safe autofixes + import reorder must be
behaviour-preserving. The existing suite is the oracle:

- `pnpm install` succeeds; `pnpm-lock.yaml` updated.
- `pnpm check` exits 0 after conforming; `pnpm lint` / `pnpm format` work.
- `pnpm typecheck`, `pnpm test`, `pnpm build` stay green.
- Visual goldens unchanged (CSS formatting is whitespace-only).
- `pnpm --filter @rtc/tests gates` stays green.
- `biome ci .` (the CI step) is green.

## Risks

- **Unknown lint-finding volume** from the recommended set on this
  RxJS/React/test-heavy codebase — handled by the iterative triage in step 4;
  rule-disable decisions routed to the user.
- **Import reordering** is the one autofix that could alter behaviour via
  side-effecting imports (e.g. `import "./index.css"`). Mitigated by running
  the full unit + e2e + visual suites after the conform pass.
- **CSS-module churn**: the just-migrated `.module.css` files get reformatted;
  whitespace-only, with visual goldens as the oracle.

## Out of scope (YAGNI)

Pre-commit hooks, `.editorconfig`, per-package Biome configs, CSS tokenisation,
and any non-recommended (style/nursery) rule groups.
