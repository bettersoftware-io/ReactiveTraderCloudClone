# Inline-Style Ban — RN + Extension Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two scope holes in the inline-`style={{…}}` ban — it never covered `client-react-native` or `devtools-extension` — and make the meta-gate (`check:react-policies`) track inline styles as a declared per-package policy so the hole cannot reopen.

**Architecture:** Pure lint-config change plus a 2-site mechanical fix. The existing `inlineStyleProp` selector (`eslint.config.mjs:78-84`) is reused; RN gets its own block with an RN-appropriate message (there is no `.module.css` on native — the prescription is `StyleSheet.create`, with the array-form dynamic member as the sanctioned runtime channel). `scripts/check-react-package-policies.mjs` gains a fourth policy key, `inlineStyleBan`, verified by asking ESLint for the resolved `no-restricted-syntax` options on a real `.tsx` file per package.

**Tech Stack:** ESLint flat config (`no-restricted-syntax`), Node script (`scripts/check-react-package-policies.mjs`).

**Spec:** Decisions from the 2026-09-01 code-quality audit session (user chose "lint gaps only"; the `X.styles.ts` split and styling-library adoption are deferred — recorded in `docs/IDEAS.md` by the companion plan `2026-09-01-rn-styling-doctrine-docs.md`). Doctrine reference: `docs/rn-styling.md` (created by that companion plan; land that PR first or in the same PR so the lint message's doc link resolves).

## Global Constraints

- Work in a worktree via `./scripts/new-worktree.sh <name>`; one PR; merge with `--merge` (see `.claude/skills/shipping-repo-changes/SKILL.md`).
- Flat config **REPLACES** a rule's options across matching blocks — every block that sets `no-restricted-syntax` must re-spread `...restrictedSyntax` (see the comment at `eslint.config.mjs:151-156`). Never write a bare `[rnInlineStyleProp]`.
- No new `eslint-disable` directives except the sanctioned `// eslint-disable-next-line no-restricted-syntax -- <reason>` form.
- Before push: `pnpm biome ci .` is NOT the command — run `npx biome ci .` from the repo root, plus `pnpm lint:eslint`, `pnpm check:react-policies`, `pnpm test:rules`.

---

### Task 1: RN + extension ban blocks and the 2-site conversion

**Files:**
- Modify: `eslint.config.mjs` (near lines 73-84 for the new const; after the existing ban block at lines 150-166 for the new block; line 162's `files` array for the extension)
- Modify: `packages/client-react-native/src/ui/analytics/PnlChart.tsx:73`
- Modify: `packages/client-react-native/src/ui/analytics/ExposureBubbles.tsx:74`

**Interfaces:**
- Consumes: existing `restrictedSyntax` array and `inlineStyleProp` const in `eslint.config.mjs`.
- Produces: exported nothing — but Task 2's probe asserts the resolved config for RN/extension `.tsx` files contains a `no-restricted-syntax` option whose selector includes `JSXAttribute[name.name='style']`.

- [ ] **Step 1: Add `devtools-extension` to the existing web ban block**

In `eslint.config.mjs`, extend the `files` array of the block whose comment reads "Inline style={{…}} ban — production UI only" (lines 157-163):

```js
    files: [
      "packages/client-react/src/**/*.tsx",
      "packages/client-prototype/src/**/*.tsx",
      "packages/client-solid/src/**/*.tsx",
      "packages/devtools-app/src/**/*.tsx",
      "packages/devtools-extension/src/**/*.tsx",
    ],
```

- [ ] **Step 2: Add the RN const and block**

Below the `inlineStyleProp` const (after line 84), add a sibling with the RN prescription (same selector — RN has no `as const` casts on styles today but the `TSAsExpression` variant costs nothing):

```js
// The same ban for React Native, with the native prescription: there is no
// CSS on native, so static styling belongs in a co-located StyleSheet.create
// block (see docs/rn-styling.md). Runtime-computed values use the array-form
// dynamic member — style={[styles.x, { height }]} — which this selector
// deliberately does NOT match (direct-child ObjectExpression only): the array
// form is RN's sanctioned runtime channel, the analogue of the web ban's
// CSS-custom-property exemption.
const rnInlineStyleProp = {
  selector:
    "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression, JSXAttribute[name.name='style'] > JSXExpressionContainer > TSAsExpression > ObjectExpression",
  message:
    "Inline style={{…}} is banned — move static styling to this file's StyleSheet.create block; pass runtime-computed values as the array-form dynamic member: style={[styles.x, { height }]}. See docs/rn-styling.md.",
};
```

Then add a new config block directly after the web ban block:

```js
  {
    // Inline style={{…}} ban, RN edition — same selector, native message.
    // Re-lists `restrictedSyntax` via the spread because flat config REPLACES
    // (does not merge) a rule's options across matching blocks.
    files: [
      "packages/client-react-native/src/**/*.tsx",
      "packages/client-react-native/app/**/*.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...restrictedSyntax, rnInlineStyleProp],
    },
  },
```

- [ ] **Step 3: Run ESLint and verify exactly 2 new errors**

Run: `pnpm lint:eslint 2>&1 | grep -A1 "PnlChart\|ExposureBubbles"`
Expected: the two known sites (`PnlChart.tsx:73`, `ExposureBubbles.tsx:74`) flagged with the new message, and **no other new errors** (`pnpm lint:eslint` exit code aside, count total errors before/after — only these 2 may appear).

- [ ] **Step 4: Convert the 2 sites to the array-form dynamic member**

Both are runtime-computed chart heights. In `PnlChart.tsx` and `ExposureBubbles.tsx`, change the shape (exact current code differs slightly per file — preserve the existing property expressions verbatim):

```tsx
// before
<View style={{ height: chartHeight }}>
// after
<View style={[{ height: chartHeight }]}>
```

If either site mixes static properties with the computed one, hoist the static part into the file's existing `StyleSheet.create` block and keep only the computed property in the array member.

- [ ] **Step 5: Verify ESLint is clean and RN tests still pass**

Run: `pnpm lint:eslint`
Expected: exit 0, zero errors.
Run: `pnpm --filter @rtc/client-react-native test`
Expected: both runners green (vitest then jest).

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs packages/client-react-native/src/ui/analytics/PnlChart.tsx packages/client-react-native/src/ui/analytics/ExposureBubbles.tsx
git commit -m "lint: extend the inline-style ban to client-react-native + devtools-extension"
```

### Task 2: `inlineStyleBan` as a declared policy in the meta-gate

**Files:**
- Modify: `scripts/check-react-package-policies.mjs` (the `POLICY` table ~line 37; `discoverReactPackages`/`firstReactFile` ~lines 66-118; the `actual` probe ~line 175)

**Interfaces:**
- Consumes: the block layout Task 1 produced in `eslint.config.mjs`.
- Produces: `POLICY` rows carrying `inlineStyleBan: boolean`; the gate fails when declared intent and resolved ESLint config disagree.

- [ ] **Step 1: Make discovery record a `.tsx` sample per package**

The ban's globs are `**/*.tsx` only, but `firstReactFile` may return a `.ts` file — probing that would read "no ban" for every package. Extend discovery to also collect the first `.tsx` React file (may be `null` for a package with no `.tsx`):

```js
function discoverReactPackages() {
  const found = new Map();

  for (const pkg of readdirSync(join(repoRoot, "packages"))) {
    for (const dir of ["src", "app"]) {
      const root = join(repoRoot, "packages", pkg, dir);
      const file = firstReactFile(root);

      if (file !== null) {
        found.set(pkg, {
          sample: file,
          tsxSample: firstReactFile(root, /\.tsx$/),
        });
        break;
      }
    }
  }

  return found;
}
```

and give `firstReactFile` an optional extension filter (default unchanged):

```js
function firstReactFile(dir, ext = /\.tsx?$/) {
```

using `ext.test(entry)` in place of the hardcoded `/\.tsx?$/.test(entry)` check. Update the two consumers of the map values (`for (const [pkg, sample] of discovered)` → `for (const [pkg, { sample, tsxSample }] of discovered)`).

- [ ] **Step 2: Add the probe and the policy rows**

Add next to `severityOf`:

```js
/** True when the resolved config carries the inline-style selector at error
 * severity — options-based, because `no-restricted-syntax` is also used for
 * the repo-wide type bans, so severity alone cannot distinguish the two. */
function inlineStyleBanned(config) {
  const entry = config.rules?.["no-restricted-syntax"];

  if (!Array.isArray(entry) || entry[0] !== 2) {
    return false;
  }

  return entry
    .slice(1)
    .some(
      (opt) =>
        typeof opt === "object" &&
        opt !== null &&
        String(opt.selector ?? "").includes("JSXAttribute[name.name='style']"),
    );
}
```

Add `inlineStyleBan` to every `POLICY` row:

```js
  "client-react": { compiler: true, memoBan: true, reactHooks: true, inlineStyleBan: true },
  "client-react-native": { compiler: true, memoBan: true, reactHooks: true, inlineStyleBan: true },
  "devtools-app": { compiler: true, memoBan: true, reactHooks: true, inlineStyleBan: true },
  "devtools-extension": { compiler: true, memoBan: true, reactHooks: false, inlineStyleBan: true, why: "…(keep existing why)…" },
  "react-bindings": { compiler: false, memoBan: true, reactHooks: false, inlineStyleBan: false, why: "…(extend existing why with:) inlineStyleBan is off because the bridge renders no styled markup — a single context Provider." },
  "client-prototype": { compiler: false, memoBan: false, reactHooks: false, inlineStyleBan: true, why: "…(keep existing why)…" },
```

(Keep each existing `why` string verbatim; only append the react-bindings sentence.)

In the verification loop, compute the actual from the `.tsx` sample:

```js
  const tsxConfig =
    tsxSample === null
      ? null
      : await eslint.calculateConfigForFile(relative(repoRoot, tsxSample));

  const actual = {
    compiler: compilerEnabled(pkg),
    memoBan: severityOf(config, "no-restricted-imports") === "error",
    reactHooks: severityOf(config, "react-hooks/rules-of-hooks") === "error",
    inlineStyleBan: tsxConfig !== null && inlineStyleBanned(tsxConfig),
  };
```

Also extend the "no entry in POLICY" failure message's decision list with a fourth line: `inlineStyleBan — is inline style={{…}} banned in this package's JSX? (eslint.config.mjs)`.

- [ ] **Step 3: Run the gate both ways**

Run: `pnpm check:react-policies`
Expected: exit 0.
Then prove it can fail: temporarily flip `"client-react-native"`'s `inlineStyleBan` to `false`, re-run, expect a mismatch failure naming the package; revert the flip.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-react-package-policies.mjs
git commit -m "gates: track inlineStyleBan as a declared react-package policy"
```

### Task 3: Design-decision note + full verification

**Files:**
- Modify: `docs/architecture/10-key-design-decisions.md` (the inline-style-ban paragraph — locate with `grep -n "inlineStyleProp" docs/architecture/10-key-design-decisions.md`, ~line 104)

**Interfaces:**
- Consumes: nothing new. Produces: doc truthfulness only.

- [ ] **Step 1: Update the design-decision paragraph**

Where the doc describes the ban's scope, replace the client-list sentence so it reads that the ban covers **all five UI packages** (`client-react`, `client-prototype`, `client-solid`, `devtools-app`, `devtools-extension`) **plus `client-react-native`** with the native message variant, and add one sentence: "Scope is enforced by `check:react-policies` (`inlineStyleBan` policy), so a new React package cannot silently sit outside the ban." Link `docs/rn-styling.md` for the RN doctrine.

- [ ] **Step 2: Verify docs and the fast gauntlet**

Run: `pnpm check:doc-links`
Expected: exit 0 (the `docs/rn-styling.md` link requires the companion docs plan to be in the same PR or already merged — see Spec note).
Run: `/rtc:gauntlet` (fast tier)
Expected: all gates green.

- [ ] **Step 3: Commit, push, PR, CI loop, merge**

```bash
git add docs/architecture/10-key-design-decisions.md
git commit -m "docs: record the widened inline-style ban scope + policy gate"
git push -u origin worktree-<name>
gh pr create --base main --title "lint: inline-style ban covers RN + extension; inlineStyleBan joins check:react-policies" --body "…"
```

Then follow shipping-repo-changes Rules 2–6 (poll `gh run list` for your `headSha`, triage catch-up, `gh pr merge --merge`, remove the worktree).
