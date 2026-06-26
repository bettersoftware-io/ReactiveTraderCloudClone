# Dev tooling roadmap & adoption tracker

A backlog of linting / static-analysis tooling we've evaluated but **not yet
adopted**. Each item records what it does, the gap it fills beyond Biome, the
decision, and a status box to tick when adopted. Nothing here is implemented yet
— this is a "pick it up later" tracker.

Evaluated 2026-06-22. All empirical findings below were run against the actual
repo (commands preserved so they're reproducible).

## Guiding principles (the lens for every decision)

These constraints drove every recommendation — re-read before adopting anything:

1. **Biome is the sole formatter+linter.** Policy is *zero findings, no
   disables* (`biome.jsonc`, `preset: "recommended"`). Green = truly clean.
2. **Separate concerns, don't restrict location.** The pain we walked away from
   was (a) two tools owning the *same* concern — two *formatters* fighting over
   whitespace, and (b) **React Buddy**, an editor *hook-deps plugin* (not ESLint)
   showing live findings CI didn't. The fix is **concern separation**, not
   "CI-only": Biome owns all formatting + correctness; any second tool enables
   only non-overlapping rules (`eslint-config-prettier` kills layout overlap).
   With that separation a second linter can run **anywhere — local CLI + CI**
   (same config → identical results). The only editor caveat: keep it
   *lint-only* (Biome stays the sole formatter); disable React Buddy separately.
3. **Prefer reporters over gates initially.** Adopt new tools report-only first
   (matches the coverage-reports pattern); promote to blocking only once the
   baseline is clean.
4. **"Make choices, defer commitment."** Tools should be swappable per package,
   not woven into the monorepo core.

## Status legend

- ⬜ **Not started** — evaluated, parked
- 🟡 **Evaluating / in progress**
- ✅ **Adopted**
- ❌ **Rejected** (reason recorded)

## Summary

| # | Tool / capability | Fills gap Biome can't | Overlap | Effort | Recommendation | Status |
|---|---|---|---|---|---|---|
| 1 | **Custom Biome GritQL rules** | House-style shape bans (no second tool) | none | low | **Adopt** — 4 rules already validated | ✅ |
| 2 | **knip** | Cross-file unused exports/files/deps | none | low | **Adopt** (report-only) | ✅ |
| 3 | **actionlint** | GitHub Actions / YAML correctness | none | trivial | **Adopt** | ✅ |
| 4 | **dependency-cruiser** | Circular deps + transitive architecture rules | partial w/ Biome `noRestrictedImports` | medium | **Adopt** (top cycle pick) | ✅ |
| 5 | **manypkg** *or* **syncpack** | Monorepo dep-version consistency | each other (pick one) | low | **Adopt one** (report-only) | ✅ |
| 6 | **Scoped ESLint** (lint-only, runs local + CI) | Rules GritQL can't do (decl-vs-expr, autofix, type-aware) | by construction: none w/ Biome | medium | **Conditional** — adopt if rule wishlist grows or type-aware rules wanted | ✅ |
| 7 | **Stylelint** | CSS naming/token/policy conventions | real w/ Biome CSS | medium | **Adopt** (scoped: validity-delta + naming + text-colour tokens) | ✅ |
| 8 | **husky (+ lint-staged)** | Local pre-commit hooks | duplicates CI gate | low | **Reject** — friction for sandboxed auto-commits | ❌ |
| 9 | **markdownlint / commitlint** | MD style / commit-msg format | — | low | **Reject** — cosmetic for this repo | ❌ |

### Quick win (independent of any adoption)

- [x] Fix dependency drift: `@rtc/tests` pins `tsx@^4.19.0`; repo norm is `^4`.
      Align `tests/package.json` → `tsx@^4`. (Surfaced by both manypkg and
      syncpack; trivial, do anytime.)

---

## 1. Custom Biome GritQL rules ✅

**What:** Biome 2.0+ supports user-authored lint rules as GritQL `.grit` files —
declarative *code-shape* patterns, referenced from `biome.jsonc` `"plugins"`.
Runs inside `biome lint` / `biome ci`; no second tool, no build step.

**Why this and not ESLint custom rules:** Biome has **no JS plugin API** — you
cannot load an ESLint-style `create(context)` rule or `npm install` someone
else's Biome rule. GritQL is the *only* user extension point. For simple
"ban this shape" rules it's actually *less* boilerplate than ESLint; for
anything needing logic/types/autofix it can't compete (see item 6).

**Proven GritQL limits (tested 2026-06-22):**
- ✅ Can capture nodes and regex-match their **source text** (full-match semantics).
- ❌ Cannot introspect **TypeScript type nodes** structurally (`interface`,
  `type X = {…}`, `{…}`-as-type all fail to match) → we use regex-on-text as a
  heuristic workaround.
- ❌ Cannot distinguish **function declaration vs expression** (textually
  identical; node-kind only).
- ❌ **No autofix** in plugins (diagnostic-only as of 2.5).

**Status note:** Implemented as ESLint rules (item 6); GritQL plugins not built
— see spec docs/superpowers/specs/2026-06-22-dev-tooling-adoption-design.md.

**Adoption plan:** create `biome-plugins/` (does not exist yet), add `.grit`
files, then `"plugins": ["./biome-plugins/<rule>.grit", …]` in `biome.jsonc`.

### Validated rules ready to drop in

- [x] **no-inline-return-type** — forbid inline object types in function return
      position (the "PropsHost return type" annoyance). *Validated: flags
      single- & multi-line inline returns; leaves named types, generic args
      (`Promise<{…}>`), and inferred returns clean.* Covers `function` decls
      only; arrow/param variants are addable.

```grit
// biome-plugins/no-inline-return-type.grit
language js

`function $name($args): $ret { $body }` where {
    $ret <: r"\{[\s\S]*\}",
    register_diagnostic(
        span = $ret,
        message = "Inline object return type — extract to a named interface/type alias."
    )
}
```

- [x] **no-arrow-implicit-return** — require block bodies on arrows (no implicit
      returns). *Validated: flags `() => x`, leaves `() => { return x }`.*

```grit
// biome-plugins/no-arrow-implicit-return.grit
language js

`($a) => $body` where {
    not $body <: r"\{[\s\S]*\}",
    register_diagnostic(span = $body, message = "Use a block body with an explicit return.")
}
```

- [x] **destructure-use-hooks** — forbid binding the whole `useHooks()` object;
      force `const { useX } = useHooks()`. *Validated: flags
      `const hooks = useHooks()` (any name), leaves destructured form clean.*
      This stops the whole-object *bind* but, on its own, does **not** stop the
      inline chained call `useHooks().useX()` — that survives with a
      `MemberExpression` callee the selector can't see. The companion rule below
      closes that gap.
- [x] **no-chained-use-hooks** *(added 2026-06-26)* — forbid chaining off
      `useHooks()` (`useHooks().useX()`). Selector
      `MemberExpression[object.callee.name='useHooks']` in `eslint.config.mjs`.
      *Validated: flagged all 10 surviving chained callsites red, then green
      after converting each to `const { useX } = useHooks(); useX(args)`.*
      Together the two rules force the destructure-first idiom with no escape
      hatch.

```grit
// biome-plugins/destructure-use-hooks.grit
language js

`const $lhs = useHooks()` where {
    not $lhs <: r"\{[\s\S]*\}",
    register_diagnostic(
        span = $lhs,
        message = "Destructure the hooks you need: const { useX } = useHooks()"
    )
}
```

- [x] **no-anonymous-function-expression** — flag nameless `function (){}`.
      *Validated partial: catches anonymous `function` expressions; cannot
      cover arrows (always nameless, name-inferred). Lower priority.*

**Cannot do in GritQL (needs ESLint — see item 6):**
- "Forbid function expressions, allow declarations" (`func-style`) — decl/expr
  indistinguishable by text.
- Any autofix (e.g. auto-extracting an inline type to a named one).

**Next step when picked up:** add arrow + param patterns to no-inline-return-type,
run all rules against `packages/client-react/src`, decide blocking vs report-only
per hit count.

---

## 2. knip ✅

**What:** finds unused **files, exports, and dependencies** across the monorepo.

**Gap filled:** Biome only flags unused *locals within a file*. It cannot see a
dangling exported function/type or an unused `package.json` dep. Pairs naturally
with clean-arch boundaries (would have caught the 6 dead seam hooks the dumb-UI
refactor pruned by hand).

**Overlap:** none. Pure reporter — fits the "no new gates" stance.

**Recommendation:** **Adopt**, report-only first (`lint:dead` script + non-blocking
CI step). Check baseline noise before deciding on a gate.

---

## 3. actionlint ✅

**What:** static validation of GitHub Actions workflows — YAML syntax, shell in
`run:` blocks, expression typos.

**Gap filled:** Biome never looks at YAML. We have `ci.yml` +
`update-visual-goldens.yml` with non-trivial logic (grep-gates, the blocking
Biome gate, parallel e2e).

**Overlap:** none. Single binary, trivial to add.

**Recommendation:** **Adopt.**

---

## 4. dependency-cruiser ✅  (circular deps + architecture)

**What:** whole-graph dependency analysis — circular detection **and** an
architecture rule engine (forbid layer violations, orphans).

**Why top pick for this repo:**
- Type-aware circular detection (configure `no-circular` to **exclude
  type-only** edges — see critical finding below).
- Enforces the **clean-architecture layering** (domain → shared → client/server)
  as validated rules. Strictly stronger than the current Biome
  `noRestrictedImports` (`../../**`) ban, which only sees the literal import
  string, not the *transitive* graph.
- Resolves `tsconfig` paths **and** `package.json` `imports` (our `#/`) via
  enhanced-resolve.
- Monorepo-aware, graphviz output, actively maintained.

**Cost:** a `.dependency-cruiser.cjs` config (acceptable — we codify architecture
anyway).

### 🔑 Critical finding (2026-06-22): we have ZERO real cycles

The "best cycle tool" question reduces to **"does it distinguish `import type`
edges?"** — type-only cycles vanish after compilation; counting them is a false
alarm.

| Run | Result |
|---|---|
| `madge --circular` (counts type edges; 11 unresolved-`#/` warnings) | ✗ "4 circular dependencies" (false) |
| `dpdm --circular` (default, counts type edges) | ✗ same 4 (false) |
| `dpdm -T --circular` (transpiles → elides `import type`) | ✅ **0 cycles** |

The 4 reported cycles are all type-only (`machine.ts` ↔ presenters via
`import type`). **Whatever tool we pick must exclude type-only edges**, or we'll
chase ghosts.

Reproduce:
```bash
pnpm dlx dpdm -T --circular --no-warning --no-tree \
  --tsconfig packages/client-react/tsconfig.json \
  "packages/client-react/src/**/*.{ts,tsx}"
```

### Tool ranking (2026)

1. **dependency-cruiser** — cycles (type-aware) + architecture rules + alias
   resolution in one gate. **Recommended.**
2. **skott** — modern, fast, zero-config, type-edge-aware; best if we only want
   cycles + graph without the rule engine.
3. **dpdm** — fine & familiar; **always pass `-T`**.
4. **madge** — keep for ad-hoc visualization only; weak as a TS gate.
5. **dep-tree** (Rust) — fast on huge repos; unnecessary at our size (244 files).
6. **eslint-plugin-import `no-cycle`** — only if ESLint (item 6) lands; per-package
   & slow; dep-cruiser wins for cross-package.

> ("depwalker" — not a real tool; likely a mis-memory of dependency-cruiser/skott.)

**Recommendation:** **Adopt dependency-cruiser**, report-only — encode
type-aware `no-circular` + the inward-only layering rules.

---

## 5. manypkg OR syncpack ✅  (pick ONE)

**What:** keep dependency versions consistent across the 5 packages' package.json.

**Gap filled:** nothing stops version drift across packages today (Renovate keeps
us *up to date*, not *aligned*).

### Finding (2026-06-22): they catch the same thing; extras are lopsided

| Finding | manypkg | syncpack |
|---|---|---|
| `@rtc/tests` `tsx@^4.19.0` → `^4` (the real one) | ✅ | ✅ |
| `@rtc/root` version missing | — | ✅ (likely false-positive: private root) |
| package.json props/scripts not sorted (all 6) | — | ✅ (opinion — would reorder our logical script order) |
| Structural checks (root private, workspace globs) | ✅ all passed | — |

The one finding we care about (version drift) is caught **identically**.
manypkg's extras are dormant (passed); syncpack's extras are opinions we'd
suppress. **Running both = double-reporting the one real finding** → erodes the
clean signal. Pick one.

- **manypkg** — zero-config, gave the cleanest result (1 true-positive, nothing
  to disable). Best for a quick drift/sanity gate.
- **syncpack** — configurable policy DSL; worth it **only** if we want to codify
  policy (e.g. machine-enforce the `@rtc/domain` rxjs-only-runtime-dep rule).

**Recommendation:** **manypkg** for a zero-config report-only gate; switch to
**syncpack** if we decide to codify dependency policy.

---

## 6. Scoped ESLint (lint-only, runs local + CI) ✅  (conditional)

**What:** a *minimal* ESLint that runs **only** opinionated AST rules GritQL
can't express, with **all formatting deferred to Biome**. Run it **wherever you
want — local CLI (`pnpm lint:eslint`) and CI** — off one shared config, so
results are identical and there's no divergence. With formatting fully deferred
there is nothing for it to fight Biome over. (Earlier drafts said "CI-only";
that was over-cautious — the pain we fled was two tools owning the *same*
concern + an editor hook-deps plugin, not "ESLint runs locally." See
principle 2.)

**When to adopt — threshold rule:** our house-style wishlist is converging on the
typescript-eslint stylistic set. At 1–2 rules, GritQL hacks suffice. Adopt ESLint
once **either**:
- the wishlist needs rules GritQL can't do, **or**
- we want **type-aware** rules (genuinely valuable in this RxJS codebase):
  `no-floating-promises`, `no-misused-promises`, exhaustive-switch.

**Rules that *require* this (GritQL can't):**

| Want | ESLint rule |
|---|---|
| Forbid function expressions, prefer declarations | `func-style: ["error","declaration"]` |
| Forbid implicit-return arrows | `arrow-body-style: ["error","always"]` |
| Forbid anonymous function expressions | `func-names: ["error","always"]` |
| **Exactly one blank line between blocks** (fns/types/`describe`/`it`) | `padding-line-between-statements` + `lines-between-class-members` |
| Inline-type ban (structural, + autofix) | custom rule / `no-restricted-syntax` w/ `TSTypeLiteral` selector |
| Floating promises etc. (type-aware) | `@typescript-eslint/no-floating-promises` |

The blank-line rule is the clearest "Biome can't, ESLint can" case: Biome's
formatter *caps* consecutive blanks at 1 but never *requires* one, and there is
no Biome lint equivalent. ESLint owns the "require a separator" half.

**Coupling note:** if this lands, **migrate the inline-type GritQL rule (item 1)
to a custom ESLint rule** — structural `TSTypeLiteral` matching beats the regex
heuristic, and the tool's already paid for.

**Setup contract (to avoid the old pain):** `eslint-config-prettier` (or simply
don't enable layout rules) so zero formatting overlap with Biome; flat config;
one shared config used by both `pnpm lint:eslint` (local) and CI. **Speed-tier:**
AST-only rules need no type info (fast) — keep them in the default script;
type-aware rules build the TS program (slower) — put them in a separate opt-in
script so everyday local lint stays fast. **Editor (optional):** enable ESLint
as a *linter only* — Biome remains the sole formatter / format-on-save; React
Buddy's hook-deps inspection is a separate plugin, disable it independently.

**Recommendation:** **Hold.** Keep GritQL while Biome is the sole linter. Adopt
only when the threshold above is crossed.

---

## 7. Stylelint ✅  (adopted — scoped non-overlap with Biome)

**What Stylelint does that Biome's CSS linter cannot** (Biome covers validity:
unknown props, duplicates, empty blocks; Stylelint adds *policy*):
- naming-pattern enforcement (`selector-class-pattern`, `custom-property-pattern`)
  — relevant for CSS Modules (classes become JS identifiers)
- design-token enforcement (force `var(--x)`, ban literals) via
  `stylelint-declaration-strict-value`
- threshold/allow-list rules (max nesting/specificity, `property-disallowed-list`)
- empty-line-before enforcement (the "exactly one blank line" ask — **CSS only**)
- enforced property ordering (`stylelint-order`)
- browserslist-aware unsupported-feature checks; logical-property (RTL) enforcement

**Why initially held:** our 45 CSS Modules are **frozen golden contracts** that
port verbatim to SolidJS; Biome already lints+formats them. The cosmetic rules
fight "goldens are the oracle."

**What changed (adopted 2026-06-22):** the visual goldens (dual-set, 3 tiers,
including light-theme) are a strong-enough oracle that any rendering change is
caught — so "frozen" stopped being a blocker. Adopted as `stylelint.config.mjs`,
deliberately **not** extending `stylelint-config-standard` (that re-introduces
formatting + validity rules that fight Biome). Three scoped groups, all running
**blocking, local + CI** (`pnpm lint:css`):
1. **Validity Biome lacks** — `color-no-invalid-hex`, `no-duplicate-selectors`,
   `no-invalid-double-slash-comments`, `no-irregular-whitespace`,
   `declaration-block-no-duplicate-custom-properties`,
   `font-family-no-missing-generic-family-keyword`,
   `function-linear-gradient-no-nonstandard-direction`, `string-no-newline`.
2. **Naming policy** — `selector-class-pattern` (camelCase, CSS-Module classes
   become JS identifiers) + `custom-property-pattern` (kebab tokens). 0 existing
   violations.
3. **Design-token enforcement** — `declaration-strict-value` on
   `color`/`fill`/`stroke` only. Fixed the 15 raw `color: #fff` literals by
   adding a theme-independent `--text-on-accent` token. Scoped to text colour
   on purpose: tokenizing the `background-color` `rgba()` tints would make
   currently theme-independent tints theme-aware — a rendering change, not a
   lint fix — so they stay literal (and `rgba()` is a function, which
   strict-value already accepts).

Verified: stylelint 0, Biome clean, typecheck 9/9, **visual goldens unchanged
(no `--update`, 0 PNG diffs)**.

> Note: Stylelint is **CSS-only** — it can never enforce blank lines / inline
> types / function style in `.ts` files. That's GritQL/ESLint territory.

---

## 8. husky (+ lint-staged) ❌

**What:** Git hooks manager — runs scripts on `pre-commit`/`commit-msg`/`pre-push`.

**Why reject:** (1) we run sandboxed Claude with `--dangerously-skip-permissions`
for long autonomous runs that commit directly to local main — a pre-commit hook
firing Biome on every commit is friction and could stall automation. (2) The
blocking `biome ci` gate already enforces this where it matters. Local hooks
duplicate CI while slowing the inner loop.

**Recommendation:** **Reject.**

---

## 9. markdownlint / commitlint ❌

- **markdownlint** — 127 `.md` files, but they're docs/specs/scratch, not shipped
  artifacts. Cosmetic.
- **commitlint** — we commit directly to local main with a fixed trailer
  convention; a hook would mostly get in the way.

**Recommendation:** **Reject** for this repo.

---

## 10. Considered & dismissed (no tracking needed) ❌

- **publint / are-the-types-wrong (`attw`)** — validate package publishing
  correctness (exports maps, types resolution). We don't publish to npm, so
  N/A. Revisit only if any `@rtc/*` package is ever published.
- **depcheck** — unused-dependency finder, superseded by **knip** (item 2),
  which covers unused deps *and* files *and* exports. Don't add both.

---

## Appendix — what Biome already covers (so we don't re-add it)

- JS/TS/JSX/TSX lint + format; JSON; **CSS lint + format** (property-sorting
  deliberately OFF — cascade risk, goldens are the oracle).
- Import boundary ban via `noRestrictedImports` (`../../**`) — path-string based,
  *not* transitive (item 4 supersedes for graph rules).
- Blank lines: the **formatter caps** consecutive blanks at 1, but does **not
  require** one (no `padding-line-between-statements` equivalent). The "exactly
  one blank line between blocks" rule is **not achievable in Biome** for TS —
  see item 6 for the ESLint solution.
