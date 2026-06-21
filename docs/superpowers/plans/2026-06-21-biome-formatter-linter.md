# Biome Formatter + Linter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Biome 2.5.0 as the monorepo's single formatter + linter (recommended rules enabled), conform the existing tree to it, and enforce it as a blocking CI gate.

**Architecture:** A single root `@biomejs/biome` dev dependency and a single root `biome.json` cover all five workspaces (Biome's monorepo idiom — no per-package configs). The existing un-formatted tree is conformed in one mechanical `biome check --write` pass; the existing test/build/visual suites are the oracle proving the reformat is behaviour-preserving. CI gains a blocking `biome ci .` step.

**Tech Stack:** Biome 2.5.0 (Rust single binary: formatter + linter + import-organiser), pnpm 11.7.0 workspaces, Turborepo ^2.4, Node 26, TypeScript ^6.

**Spec:** `docs/superpowers/specs/2026-06-21-biome-formatter-linter-design.md`

**Execution note:** Run this work on a branch (e.g. `feat/biome-formatter-linter`), not directly on `main`. All four tasks land together before merge; CI (Task 4) must come last so the gate only activates after the tree is green (Tasks 2–3).

## Global Constraints

- Biome version is **exactly `2.5.0`**, pinned with **no caret** (`"@biomejs/biome": "2.5.0"`). It is the latest dist-tag and is ~217h old, clearing the 24h cooldown.
- **Single root dev dependency** (`pnpm add -Dw`) and **single root `biome.json`**. No per-package Biome configs, no per-package Biome scripts.
- Linter runs with **`rules.recommended: true`** (explicit). **No recommended rule may be disabled without the user's sign-off**, and any approved disable must be documented inline in `biome.json` with its reason.
- **CSS is in scope**: Biome formats + lints `.css` / `.module.css`.
- **CI gate is blocking**: a `biome ci .` step that fails the build on any violation.
- **Do NOT modify `pnpm-workspace.yaml`**: Biome 2.5.0 has no install scripts (binary ships via `optionalDependencies`), so it needs no `allowBuilds` entry; the `minimumReleaseAge` policy is unchanged.
- **Do NOT regenerate visual goldens** (no `--update`). They must stay byte-identical; they are the oracle that the reformat is behaviour-preserving.
- **Do NOT modify `renovate.json5`**: it is JSON5, excluded from Biome, and Renovate already manages the dep under the same cooldown.
- Formatter style (chosen to match existing code, minimising churn): 2-space indent, line width 80, LF line endings; for JS/TS — double quotes, semicolons always, trailing commas all.
- Ignored paths (beyond `.gitignore`): `**/dist`, `**/reports`, `**/coverage`, `**/__screenshots__`, `**/*.png`, `**/.turbo`, `**/*.json5`, `pnpm-lock.yaml`.
- Commit trailer on every commit, exactly:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File Structure

- `biome.json` (create, repo root) — the single source of truth for formatter, linter, assist, file scoping, and the tsconfig JSONC override.
- `package.json` (root, modify) — add the `@biomejs/biome` dev dependency and the `format` / `lint` / `check` / `check:fix` scripts.
- `turbo.json` (modify) — remove the now-orphaned empty `lint` task.
- `pnpm-lock.yaml` (modify, generated) — updated by `pnpm add`; committed.
- Source tree across `packages/*` and `tests/` (modify, Task 2) — reformatted + safe-autofixed + imports organised.
- `.github/workflows/ci.yml` (modify, Task 4) — add the blocking Biome step to the `checks` job.

---

### Task 1: Install Biome, add `biome.json`, wire root scripts

**Files:**
- Modify: `package.json` (root)
- Create: `biome.json` (root)
- Modify: `turbo.json`
- Modify (generated): `pnpm-lock.yaml`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working `pnpm exec biome` at version 2.5.0; root scripts `format` / `lint` / `check` / `check:fix`; a `biome.json` that loads without configuration errors. Tasks 2–4 rely on `biome.json` existing and `biome` being runnable.

- [ ] **Step 1: Add the dependency (exact pin, workspace root)**

Run:
```bash
pnpm add -Dw @biomejs/biome@2.5.0
```
Expected: install succeeds, `package.json` gains `"@biomejs/biome": "2.5.0"` under `devDependencies`, `pnpm-lock.yaml` updated. There should be **no** "Ignored build scripts" warning for Biome (it has none); if pnpm reports one, stop and investigate before continuing.

- [ ] **Step 2: Verify the version and that the pin has no caret**

Run:
```bash
pnpm exec biome --version
grep '"@biomejs/biome"' package.json
```
Expected: `Version: 2.5.0` (or `2.5.0`); the grep shows `"@biomejs/biome": "2.5.0"` with no `^` or `~`.

- [ ] **Step 3: Create `biome.json`**

Create `biome.json` at the repo root with exactly this content:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": [
      "**",
      "!**/dist",
      "!**/reports",
      "!**/coverage",
      "!**/__screenshots__",
      "!**/*.png",
      "!**/.turbo",
      "!**/*.json5",
      "!pnpm-lock.yaml"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80,
    "lineEnding": "lf"
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "json": {
    "formatter": {
      "enabled": true
    }
  },
  "css": {
    "formatter": {
      "enabled": true
    },
    "linter": {
      "enabled": true
    }
  },
  "overrides": [
    {
      "includes": ["**/tsconfig*.json"],
      "json": {
        "parser": {
          "allowComments": true,
          "allowTrailingCommas": true
        }
      }
    }
  ]
}
```

Why the `overrides` block: six `tsconfig*.json` files in this repo contain `//` comments (`tests/tsconfig.json`, `packages/client-react/tsconfig.ui-contract.json`, `packages/client-react/tsconfig.ui-visual.json`, `packages/domain/tsconfig.json`, `packages/server/tsconfig.json`, `packages/shared/tsconfig.json`). Without JSONC parsing Biome would emit parse errors on them. Scoping `allowComments`/`allowTrailingCommas` to `tsconfig*.json` keeps strict JSON parsing for `package.json` and other `.json`.

- [ ] **Step 4: Verify the config loads with no configuration or parse ERROR**

Run:
```bash
pnpm exec biome check . ; echo "exit=$?"
```
Expected: Biome **runs** and prints formatting diffs / lint findings (this is normal — the tree is not conformed yet), and `exit` is non-zero. The output must contain **no** lines of severity `configuration` (e.g. "Found an unknown key") and **no** `parse`-level errors on the tsconfig files. If Biome reports an unknown configuration key, it names the exact key — fix `biome.json` to the key spelling Biome reports for 2.5.0, then re-run until there are no configuration diagnostics. (Findings/diffs remaining is expected; configuration errors are not.)

- [ ] **Step 5: Confirm tsconfig JSONC parsing works**

Run:
```bash
pnpm exec biome check tsconfig.base.json packages/server/tsconfig.json packages/domain/tsconfig.json ; echo "exit=$?"
```
Expected: no parse errors about comments/trailing commas on these files (formatting diffs are fine).

- [ ] **Step 6: Wire root scripts**

In root `package.json`, replace the existing line `"lint": "turbo run lint",` and add the three new scripts so the scripts block contains:
```json
    "format": "biome format --write .",
    "lint": "biome lint .",
    "check": "biome check .",
    "check:fix": "biome check --write .",
```
(Keep all other existing scripts unchanged. Place these alongside the other top-level scripts; the existing `"lint"` entry is replaced, not duplicated.)

- [ ] **Step 7: Remove the orphaned turbo `lint` task**

In `turbo.json`, delete the now-unused task entry:
```json
    "lint": {},
```
(Nothing references `turbo run lint` after Step 6.)

- [ ] **Step 8: Verify scripts resolve**

Run:
```bash
pnpm lint --help >/dev/null && echo "lint ok"
pnpm exec biome format --help >/dev/null && echo "format ok"
```
Expected: both print their `ok` line (the scripts invoke Biome, not turbo).

- [ ] **Step 9: Commit**

```bash
git add package.json biome.json turbo.json pnpm-lock.yaml
git commit -m "build: add Biome 2.5.0 formatter + linter (config + scripts)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Conform the tree (format + safe autofixes + organise imports)

**Files:**
- Modify: source files across `packages/*` and `tests/` (mechanical reformat; exact set determined by Biome).

**Interfaces:**
- Consumes: `biome.json` and runnable `biome` from Task 1.
- Produces: a tree where `biome check .` reports **only** non-autofixable lint findings (zero formatting diffs). Task 3 consumes the enumerated remaining findings.

- [ ] **Step 1: Apply formatting + safe fixes + import organisation**

Run:
```bash
pnpm exec biome check --write .
```
Expected: Biome rewrites files and prints a summary (e.g. "Formatted N files", "Fixed N files"). This applies the formatter, safe lint fixes, and `organizeImports` across the whole tree.

- [ ] **Step 2: Confirm no goldens or binary assets were touched**

Run:
```bash
git status --porcelain | grep -E "__screenshots__|\.png$|pnpm-lock\.yaml|\.json5$" || echo "NONE — good"
```
Expected: `NONE — good` (the ignore globs held; the conform pass touched no screenshots, PNGs, lockfile, or JSON5).

- [ ] **Step 3: Typecheck still passes**

Run:
```bash
pnpm typecheck
```
Expected: PASS for all packages (formatting/import-order changes must not break types).

- [ ] **Step 4: Unit + contract tests still pass**

Run:
```bash
pnpm test
```
Expected: PASS (same suite CI runs).

- [ ] **Step 5: Build still passes**

Run:
```bash
pnpm build
```
Expected: PASS (topological build of all packages).

- [ ] **Step 6: Visual goldens unchanged (the CSS-reformat + import-reorder oracle)**

Run:
```bash
pnpm test:ui:visual
```
Expected: PASS with zero pixel diffs across all three tiers. This is the proof that reformatting `.module.css` (whitespace-only) and reordering imports (incl. side-effecting `import "./index.css"`) did not change rendered output. If any diff appears, do **not** update goldens — investigate the offending change.

- [ ] **Step 7: Architecture + supply-chain gates still pass**

Run:
```bash
pnpm --filter @rtc/tests gates
```
Expected: PASS (the grep/architecture gates and `pnpm audit --prod` are unaffected by formatting).

- [ ] **Step 8: Record remaining lint findings for Task 3**

Run:
```bash
pnpm exec biome check . ; echo "exit=$?"
```
Expected: zero **formatting** diffs remain. Any remaining output is non-autofixable **lint** findings; copy the full list (rule name + file:line for each) into the task report for Task 3. If `exit=0` already, note "no remaining findings" — Task 3 becomes a verification-only gate.

- [ ] **Step 9: Commit the conformed tree**

```bash
git add -A
git commit -m "style: conform repo to Biome (format + safe fixes + organise imports)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Triage remaining lint findings to green

**Files:**
- Modify: whichever source files carry the findings recorded in Task 2 Step 8.
- Modify (only with user sign-off): `biome.json` (documented rule disables).

**Interfaces:**
- Consumes: the remaining-findings list from Task 2.
- Produces: `biome check .` exits 0.

- [ ] **Step 1: Reproduce the remaining findings**

Run:
```bash
pnpm exec biome check . ; echo "exit=$?"
```
Expected: the findings recorded in Task 2 Step 8. If `exit=0`, skip to Step 5 (nothing to triage).

- [ ] **Step 2: Fix genuine findings in source, one rule at a time**

For each finding that is a real issue, edit the source to satisfy the rule, then re-check just that file:
```bash
pnpm exec biome lint path/to/changed/file.ts ; echo "exit=$?"
```
Expected: `exit=0` for that file once fixed. Repeat across the findings. Do not introduce behaviour changes beyond what the rule requires.

- [ ] **Step 3: ESCALATE any rule that cannot be cleanly satisfied**

If a recommended rule produces findings that are false positives for this codebase (e.g. an RxJS/React/test idiom the rule misreads) or would require a behaviour change you cannot justify, **stop and escalate to the user**. Provide: the rule name, 2–3 concrete examples (file:line), and a proposed resolution (fix vs. disable-with-reason). Do **not** disable any recommended rule without explicit user sign-off.

- [ ] **Step 4: Apply only user-approved rule disables, documented inline**

If and only if the user approves a disable, add it under `linter.rules` in `biome.json` with an inline-adjacent justification, e.g.:
```json
      "rules": {
        "recommended": true,
        "suspicious": {
          "noExplicitAny": "off"
        }
      }
```
Record the reason in the task report (Biome JSON does not support comments). Re-run `pnpm exec biome check .` after each change.

- [ ] **Step 5: Verify green**

Run:
```bash
pnpm exec biome check . ; echo "exit=$?"
```
Expected: `exit=0`.

- [ ] **Step 6: Re-run the safety net for any source changed in Steps 2–4**

Run:
```bash
pnpm typecheck && pnpm test
```
Expected: PASS. (Skip only if Steps 2–4 changed no source — i.e. Task 3 was verification-only.)

- [ ] **Step 7: Commit (skip if no changes were made)**

```bash
git add -A
git commit -m "fix: resolve remaining Biome lint findings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
If nothing changed (Task 2 already left the tree green), make no commit and note "verification-only, already green".

---

### Task 4: Add the blocking Biome CI gate

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: a tree where `biome ci .` exits 0 (Tasks 2–3).
- Produces: a CI step that fails the build on any Biome violation.

- [ ] **Step 1: Confirm the exact CI command is green locally (the proxy for the runner)**

Run:
```bash
pnpm exec biome ci . ; echo "exit=$?"
```
Expected: `exit=0`. `biome ci` is the no-write, CI-optimised command covering format + lint + assist; it must be green before wiring it into the workflow.

- [ ] **Step 2: Add the step to the `checks` job**

In `.github/workflows/ci.yml`, inside the `checks` job, insert a new step immediately **after** the `Install dependencies` step (`run: pnpm install --frozen-lockfile`) and **before** the `Typecheck` step, as an early fast gate:
```yaml
      - name: Lint + format (Biome)
        run: pnpm exec biome ci .
```
Match the surrounding two-space-per-level YAML indentation of the other steps in that job. Do not change any other job (`visual`, `e2e`) — Biome is a fast static check and belongs only in `checks`.

- [ ] **Step 3: Validate the workflow YAML is well-formed**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```
Expected: `yaml ok` (no parse exception).

- [ ] **Step 4: Confirm the new step is present and correctly placed**

Run:
```bash
grep -n -A1 "Lint + format (Biome)" .github/workflows/ci.yml
```
Expected: the step name followed by `run: pnpm exec biome ci .`, located between `Install dependencies` and `Typecheck` in the `checks` job.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add blocking Biome format + lint gate to checks job

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Dependency, exact pin, root-only, no `allowBuilds` → Task 1 + Global Constraints. ✓
- `biome.json` (VCS ignore, file scoping, formatter style, recommended linter, CSS, assist/organizeImports, tsconfig JSONC) → Task 1 Step 3. ✓
- Root scripts + turbo cleanup → Task 1 Steps 6–7. ✓
- Conform tree (format + safe fixes + organise imports) + full safety suite → Task 2. ✓
- Triage remaining findings + rule-disable sign-off + inline justification → Task 3. ✓
- Blocking CI gate (`biome ci .`) → Task 4. ✓
- Cooldown respected (2.5.0 ≥24h) → Global Constraints + Task 1 Step 1. ✓
- Visual goldens not regenerated → Global Constraints + Task 2 Step 6. ✓
- `pnpm-workspace.yaml` / `renovate.json5` untouched → Global Constraints. ✓

**2. Placeholder scan:** No TBD/TODO; every code/config step shows full content; every command has expected output; the one genuinely unknowable item (volume of remaining lint findings) is handled by an explicit triage + escalation task rather than a placeholder. ✓

**3. Type/name consistency:** `biome.json` keys are produced in Task 1 and consumed unchanged in Tasks 2–4; script names (`lint`, `format`, `check`, `check:fix`) are consistent; the CI command `biome ci .` matches the command verified in Task 4 Step 1; the remaining-findings handoff (Task 2 Step 8 → Task 3 Step 1) is consistent. ✓
