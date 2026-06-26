# Task 2 Report: Generator library — test-results summary + Markdown render

## Status: COMPLETE

## Commit
- `9a23c81` — feat(coverage-report): test-results summary + markdown renderer

## TDD Evidence

### testResults module

**RED (Step 2):**
```
pnpm --filter @rtc/tests exec vitest run scripts/lib/testResults.test.ts
Error: Cannot find module './testResults' ...
Test Files  1 failed (1)  Tests  no tests
```

**GREEN (Step 4):**
```
Test Files  1 passed (1)  Tests  2 passed (2)
```

### render module

**RED (Step 6):**
```
pnpm --filter @rtc/tests exec vitest run scripts/lib/render.test.ts
Error: Cannot find module './render' ...
Test Files  1 failed (1)  Tests  no tests
```

**GREEN (Step 8 — after fix, see divergence section):**
```
Test Files  2 passed (2)  Tests  6 passed (6)
```

### Final: `pnpm --filter @rtc/tests test:report`
```
Test Files  3 passed (3)  Tests  12 passed (12)
```

## Files Changed
- `tests/scripts/lib/testResults.ts` — new: `TierResult` interface + `summarize` function
- `tests/scripts/lib/testResults.test.ts` — new: 2 tests (verbatim from brief, `.ts` extension removed from import)
- `tests/scripts/lib/render.ts` — new: `SUMMARY_CAP`, `RenderInput`, `render` + internal helpers
- `tests/scripts/lib/render.test.ts` — new: 4 tests (verbatim from brief, `.ts` extensions removed from imports)
- `tests/package.json` — added `"test:report": "vitest run scripts/lib"` script

## Divergence from Brief

### 1. Import extension convention (carry-forward from Task 1)
All `from "./foo.ts"` in the brief were written as `from "./foo"` (no extension) per repo convention (`moduleResolution: "bundler"` without `allowImportingTsExtensions`).

### 2. render.ts — size-cap bug fix
The brief's `render.ts` had a size-tracking bug: the `body.join("\n")` per-element separator overhead and the final cap-warning note were not counted in the `size` variable. With the test's 400-file / 250-line fixture, the generated output was 900,076 bytes — 76 bytes over `SUMMARY_CAP = 900_000`.

Root cause: `size` tracks only element lengths, not the `"\n"` separators that `body.join("\n")` inserts between elements (~70 separators for 68 full blocks), and the note pushed at the end (128 chars) plus its own separator (+1) and the head-to-body join separator (+1) were completely untracked.

Fix: added an internal constant `CAP_RESERVE = 300` and used `SUMMARY_CAP - CAP_RESERVE` as the effective threshold for both the full-block and lean-block rejection checks. This reserves enough headroom (note ~128 chars + ~70 separators + 2 join chars = ~200 chars; 300 is the safe ceiling) without changing any exported names, the note text, or test assertions.

### 3. Biome fixes
- `"```" + lang(stat.file)` → `` `\`\`\`${lang(stat.file)}` `` (Biome `useTemplate` rule)
- Two formatting-only reformats by `biome format --write` (array literal line-wrapping in render.ts and render.test.ts)

## Self-Review
- All 4 tests from the brief pass verbatim; no assertions were altered.
- `pnpm --filter @rtc/tests typecheck` — clean.
- `pnpm exec biome ci tests/scripts/lib` — clean.
- `SUMMARY_CAP`, `TierResult`, `summarize`, `RenderInput`, `render` all exported correctly for Task 3 consumption.
- No default exports, no non-null assertions, all exported functions have explicit return types (inner helpers `pct`, `lang`, `testSection`, `coverageTable`, `snippet`, `fileBlock`, `linesOnlyBlock` already had `: string` return types in the brief and are preserved).

## Concerns
None beyond the documented size-cap fix, which is a minimal and principled correction to the brief's accounting logic.

---

## Fix: size-cap accounting

### Command
```
pnpm --filter @rtc/tests exec vitest run scripts/lib/render.test.ts
```

### RED (before fix — regression test added first)
```
FAIL  scripts/lib/render.test.ts > render > stays within the cap for many tiny files (separator accounting)
AssertionError: expected 904346 to be less than or equal to 900000
Test Files  1 failed (1)  Tests  1 failed | 4 passed (5)
```
The buggy `CAP_RESERVE = 300` code produced a string of **904 346 bytes** — **4 346 bytes over** `SUMMARY_CAP`. The bug: initial `size` omitted the `+1` separator between head and body, and each `body.push(block)` added only `block.length` rather than `1 + block.length`, accumulating ~4 500 uncounted separator bytes for 5 000 tiny files.

### GREEN (after fix)
```
Test Files  1 passed (1)  Tests  5 passed (5)
```
All 5 tests pass. Biome `ci` clean. `typecheck` clean.

### What changed
- `render.ts`: replaced `CAP_RESERVE = 300` magic margin with `NOTE_RESERVE = 256` (provably bounds the note's `1 + note.length ≤ 138 ≤ 256`).
- Initial `size` now computed as `[...head, body.join("\n")].join("\n").length` (exact, includes the head-to-body separator).
- Every `body.push(block)` / `body.push(lean)` now adds `1 + block.length` / `1 + lean.length` to `size` (counts the `"\n"` join separator each new element introduces).
- Cap/omit threshold changed from `SUMMARY_CAP - CAP_RESERVE` to `SUMMARY_CAP - NOTE_RESERVE`.
- `fileBlock` null branch now delegates to `linesOnlyBlock` instead of duplicating the literal (Finding 3 — DRY).
- Regression test added: 5 000 files × 1 uncovered line × 100-char source → ~200-byte block; total ≈ 1 M &gt; SUMMARY_CAP; asserts `md.length ≤ SUMMARY_CAP` and `/snippets omitted/i`.
