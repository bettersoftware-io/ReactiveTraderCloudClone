# Atomic Test-ID Renames — Design

> **⚠️ MERGED AS PLAN, NOT EXECUTED.** This document and its companion plan
> (`docs/superpowers/plans/2026-07-10-atomic-testid-renames.md`) are merged to
> record an approved, ready-to-run design. **No code has changed.** The
> migration is deferred and must be executed by a future SDD session against
> the plan file. This mirrors the plan-now / execute-later convention already
> used for power-saver mode (`docs/superpowers/specs/2026-07-09-power-saver-mode-design.md`,
> "approved design, implementation deferred") and feature flags
> (`docs/superpowers/specs/2026-07-01-feature-flags-design.md`).

- **Date:** 2026-07-10
- **Status:** Approved design, implementation deferred (plan at
  `docs/superpowers/plans/2026-07-10-atomic-testid-renames.md`).
- **Origin:** The enforcement-gap-closure workstream
  (`docs/superpowers/specs/2026-07-10-enforcement-gap-closure-design.md` §2.4)
  closed two cheap enforcement gaps and, for the third — grep gate 1's
  `tests/`-only scope — decided the airtight fix (atomic renames) was worth
  planning, not doing now. This is that plan's design half.

---

## 1. Problem

Grep gate 1 (`tests/scripts/grep-gates.ts`, the `GATES` entry named
`"1. No raw data-testid literals outside testids.ts"`) forbids raw
`data-testid="…"` literals — but its `paths` is `["."]` run from the `tests/`
working directory, so it polices only the **consumption site** (the page
objects and scenarios) and never the **definition site** (the React and React
Native components that actually stamp the attributes).

That is by design today, and the enforcement-gap-closure spec documents it as
such: components are the definition site, tests consume through the `TESTIDS`
registry (`tests/browser/page-objects/contracts/testids.ts`), and any drift
between a renamed component attribute and the registry is caught loudly by
failing Playwright / contract tests. The registry cannot be imported by
component code today because it lives under `tests/`, and a
`packages/* → tests` dependency edge is forbidden by the architecture
(dependencies flow inward; `tests` is the outermost consumer).

The **airtight** alternative is to make renames atomic: give components a
single importable source of truth for their test IDs, migrate every hardcoded
literal to reference it, then extend gate 1 to cover `packages/*/src` so a raw
literal fails CI anywhere. That requires relocating the registry out of
`tests/` and rewriting every literal site. This document specifies that work.

### 1.1 Re-derived scope (reproduce with these greps)

All counts below were derived on 2026-07-10 from the enforcement-gap-closure
worktree and must be re-verified at execution time (they drift as UI changes).
Commands are run from the repo root.

**Web — `@rtc/client-react` (in scope):**

```bash
# static string literals (what gate 1's `data-testid="[a-z]` pattern targets):
grep -rn 'data-testid="' packages/client-react/src --include='*.tsx' | grep -vc '\.test\.'
#   → 147 occurrences (all files; none reference a registry today)
# dynamic / templated attributes (data-testid={ … }, e.g. `tile-${pair}`):
grep -rn 'data-testid={' packages/client-react/src --include='*.tsx' | wc -l
#   → 41 occurrences
```

Per-domain occurrence breakdown (static + dynamic, excluding `*.test.*`),
which the plan uses to size the migration tasks:

| Domain (`packages/client-react/src/ui/…`) | `data-testid` occurrences |
|---|---:|
| `shell/` | 57 |
| `fx/` | 49 |
| `equities/` | 26 |
| `credit/` | 25 |
| `admin/` | 14 |
| (no `data-testid` sites live outside `src/ui/`) | 0 |

**Mobile — `@rtc/client-react-native` (in scope):**

```bash
grep -rn 'testID="' packages/client-react-native/src | wc -l      # → 91 static
grep -rn 'testID={'  packages/client-react-native/src | wc -l      # → 27 dynamic
```

Per-section occurrence breakdown (static + dynamic, excluding `*.test.*`):

| Section (`packages/client-react-native/src/ui/…`) | `testID` occurrences |
|---|---:|
| `equities/` | 36 |
| `credit/` | 27 |
| `shell/` | 17 |
| `analytics/` | 14 |
| loose `ui/*.tsx` roots (`SpotTile`, `TradeTicket`, `TradeRow`, `Blotter`, `ConnectionBanner`, `SurfaceCard`, `AppearanceScreen`) | 21 |

**Isolated island — `@rtc/client-prototype` (out of scope, see §6):**

```bash
grep -rnE 'data-testid="[a-z]' packages/client-prototype/src | wc -l   # → 8
```

**Total migration surface (in scope):** ~147 + 41 web + 91 + 27 RN ≈ **306
attribute sites** across the two shipping clients. (The parent spec's round
figure of "156 `data-testid` + 91 `testID` ≈ 247" predates this re-derivation
and counted static web literals slightly differently; the executing session
must trust its own fresh greps, not either number, and drive to **zero**
remaining raw literals as the acceptance signal — the exact count is a
sizing aid, not a contract.)

---

## 2. Goals / Non-goals

**Goals**

1. One importable registry of test-ID constants and ID-builder functions,
   shared verbatim by web components, RN components, and the test tiers.
2. Every hardcoded `data-testid` / `testID` literal in the two shipping
   clients replaced by a registry reference.
3. Gate 1 extended to police `packages/*/src` so a raw literal fails CI at the
   definition site — renames become atomic (change the registry, every
   consumer follows; a stray literal is rejected).
4. Zero behavioural change: the rendered attribute values are byte-identical
   before and after (the registry already encodes the exact strings).

**Non-goals**

- Changing any test-ID *value*. This is a move-and-reference refactor, not a
  rename of the IDs themselves.
- Touching `@rtc/client-prototype` (§6).
- Changing gate 1's existing `tests/`-tree behaviour — the extension is
  additive (widen scope), the existing exclusion of the registry file stays.
- Any visual or wire-protocol change.

---

## 3. Decision: where the registry lives

The registry must move somewhere **both** the client packages and the `tests`
workspace can import, without creating a forbidden dependency edge. Three
options were evaluated.

### Option A — new `@rtc/testids` package  ✅ **CHOSEN**

A tiny leaf package (`packages/testids/`) exporting the current `TESTIDS`
object and its ID-builder functions, depending on nothing. Web, RN, and
`tests` all add it as a dependency.

**Why it wins.** Dependencies flow inward and `@rtc/testids` is a pure leaf
(it imports nothing — the registry file has **zero** imports today), so
`domain`, both clients, and `tests` may all depend on it without inverting the
graph. It keeps test-marker concerns in their own clearly-named home, separate
from wire contracts (see Option B). It is importable by runtime UI code, which
the ID-builder functions require (§4).

**Honest costs.** A new workspace package must join every gate the
"all-gates-on-package-add" policy enumerates. Per the trailheads recipe 5
(`docs/architecture/16-trailheads.md` §"Add a package"), now itself guarded by
`pnpm check:scripts` (`scripts/check-workspace-scripts.mjs`, which requires a
`typecheck` **and** a `test`/`test:*` script in every `packages/*`
`package.json`):

- **`packages/testids/package.json`** — declare `typecheck` and `test` scripts
  (both required by `check:scripts`), plus `build`/`clean` mirroring the
  `@rtc/shared` tsc-build package (`shared` ships `main: ./dist/index.js` +
  `types: ./dist/index.d.ts`; consumers resolve compiled output through the
  workspace symlink). Name: `@rtc/testids`.
- **`packages/testids/tsconfig.json`** — extend `../../tsconfig.base.json`
  (the pattern every tsc-built package follows, e.g. `packages/ws-effects`).
- **ESLint / TypeScript project globs** — no edit needed for a standard
  `src/**/*.ts` layout: the base ESLint config globs `**/*.{ts,tsx}` repo-wide
  and `tsconfig.eslint.json` already includes `packages/*/src/**/*.ts`. (Only a
  non-standard root would need an edit — this package has none.)
- **`stylelint` / Biome** — no edit; both are repo-wide globs by design.
- **`knip.json`** — add an entry **only if** `pnpm lint:dead` reports
  false-positive unused exports; two existing packages carry no entry. Decide
  by running knip, not preemptively.
- **`.dependency-cruiser.cjs`** — hand-written per package; add a rule if the
  package has a boundary worth enforcing. `@rtc/testids` imports nothing, so
  the enforceable boundary is "`testids` imports no other `@rtc/*` package"
  (keeps it a leaf). This is optional hardening, not required for correctness.
- **Consumer `package.json`s** — add `"@rtc/testids": "workspace:*"` to
  `@rtc/client-react`, `@rtc/client-react-native`, and `tests`. Note **none of
  the three depends on `@rtc/shared` today** (the clients depend on
  `client-core`, `domain`, `react-bindings`; `tests` on `client-core`,
  `client-react`, `domain`, `server`) — so Option B below buys **no** wiring
  saving over Option A; a new `@rtc/*` dependency edge is unavoidable either
  way.
- **Inventory docs** — `docs/architecture/13-codebase-map.md` §L1 gains a row;
  write `packages/testids/README.md` from the identity-card template.
- **Verify in order** (recipe 5 change-impact checklist): `pnpm install` →
  `pnpm build` → `pnpm typecheck` → `pnpm test` → `pnpm lint:dead` →
  `pnpm check:scripts` → `pnpm check:deps` → `pnpm check:versions`.

### Option A′ — dependency vs devDependency (the runtime question)

The registry is not inert data: it exposes **functions** (e.g.
`liveRates.tile(pair) => \`tile-${pair}\``, `positions.bubble(currency)`,
`credit.newRfq.dirButton(dir)`, `shell.tab(tab)` — eleven builder functions in
the current registry). Components must call those **at render time in the
browser / on the device** to stamp dynamic attributes. Therefore
`@rtc/testids` must be a **production `dependency`** of `@rtc/client-react` and
`@rtc/client-react-native` — a `devDependency` would be dropped from the
production bundle and break rendering. For the `tests` workspace it may be a
plain `dependency` (tests are not shipped).

The honest architectural cost: a package that is conceptually "test
infrastructure" now sits in the clients' **production** dependency graph. This
is acceptable and near-zero-cost because (a) the test-ID strings are *already*
compiled into the production bundle today — they are hardcoded in the JSX; the
package only moves where the constant is defined, adding no runtime weight
beyond a tiny frozen string map; and (b) the package has no transitive deps
(pure leaf). The design explicitly accepts "test markers in prod deps" as the
price of atomic, single-source renames. Document this in the package README so
a future reader does not mistake it for a layering slip.

### Option B — fold into `@rtc/shared`  ❌ rejected

Add the registry to the existing `@rtc/shared` package.

- **Con (semantic):** `shared` is the **runtime wire-contract** package —
  DTOs and the `CLIENT_MSG`/`SERVER_MSG` envelope protocol. Test-render
  markers are not wire contracts; folding them conflates two unrelated
  concerns and confuses anyone reading `shared` for the network protocol.
- **Con (no saving):** as noted above, neither client depends on `@rtc/shared`
  today, so this option still requires adding a fresh `@rtc/shared` dependency
  edge to both clients — it saves none of Option A's wiring, while polluting a
  purpose-built package.
- **Verdict:** rejected. The only thing it avoids is the package-add
  checklist, and it pays for that with a permanent semantic smell.

### Option C — keep in `tests/`  ❌ rejected (structurally impossible)

Leave the registry at `tests/browser/page-objects/contracts/testids.ts` and
import it from component code.

- This requires a `packages/client-react → tests` (and
  `packages/client-react-native → tests`) import edge. Dependencies flow
  inward; `tests` is the outermost consumer. Such an edge inverts the graph
  and would be a boundary violation (and is exactly the kind of edge the
  enforcement-gap-closure dep-cruiser rules exist to forbid).
- **Verdict:** rejected as architecturally impossible, which is *why* a
  relocation is mandatory rather than optional.

**Decision:** create `@rtc/testids`, a zero-dep leaf package; add it as a
production `dependency` to both clients and to `tests`.

---

## 4. Dynamic-ID strategy

The registry mixes plain string constants (e.g. `shell.header = "header"`)
with **ID-builder functions** for per-instance elements (`liveRates.tile`,
`liveRates.filter`, `positions.bubble`, `positions.row`,
`credit.newRfq.dirButton`, `credit.newRfq.instrumentOption`,
`credit.newRfq.dealer`, `credit.rfqs.filterPill`, `credit.rfqs.card`,
`admin.incident.inject`, `shell.tab`). Prefix constants
(`liveRates.tilePrefix = "tile-"`, `positions.bubblePrefix`,
`credit.rfqs.quotePrefix`, `layout.handlePrefix`) exist for the test side's
prefix-match queries and stay as-is.

**Rule:** components must call the *same* functions the tests call — that is
the entire point of a single source of truth. A component that today writes
`` data-testid={`tile-${pair}`} `` becomes
`data-testid={TESTIDS.liveRates.tile(pair)}`. Because those functions run in
the browser / on the device, the package must be **runtime-importable** by UI
code, which reconfirms Option A′'s production-`dependency` decision.

Static literals become the corresponding constant reference
(`data-testid="header"` → `data-testid={TESTIDS.shell.header}` for web;
`testID="header"` → `testID={TESTIDS.shell.header}` for RN — the registry is
framework-neutral, so RN and web share the identical constants and builders).

---

## 5. Gate-1 scope extension

Once — and only once — **zero** raw literals remain in the client `src` trees,
gate 1 (`tests/scripts/grep-gates.ts`) is widened so the definition site is
policed:

- Add `../packages/client-react/src` and `../packages/client-react-native/src`
  to gate 1's `paths` (it currently runs with `paths: ["."]` from `tests/`).
- Keep the existing `browser/page-objects/contracts/testids.ts` exclusion; the
  registry now lives in `packages/testids/src`, which contains **no**
  `data-testid="`/`testID="` string literals (it *builds* them via template
  strings and constants, so the `data-testid="[a-z]`/`testID="[a-z]` patterns
  do not match it) — verify with a probe during execution, and add an explicit
  exclude only if a probe shows a false positive.
- The gate's pattern already targets `data-testid="[a-z]`; add a sibling
  pattern / gate entry for `testID="[a-z]` so the RN literal form is caught
  too (RN uses `testID`, not `data-testid`). Follow gates 26–29's mirror
  structure.

This step is the **last** task in the plan — running it before the migration
completes would fail CI on the very literals the migration is removing.

**Violation probe (per the enforcement-gap-closure §3.1 mandate):** after the
scope extension lands, temporarily add a raw `data-testid="probe-fail"` to a
web component and a `testID="probe-fail"` to an RN component, run the gates,
observe gate 1 FAIL naming each file, revert, observe PASS. Record both
outputs. A gate that cannot be made to fail is not shipped.

---

## 6. `@rtc/client-prototype` is excluded (rationale)

The prototype has 8 of its own `data-testid` literals but is a deliberately
**isolated island**: it imports only `react`/`react-dom`, no `@rtc/*` packages
(the enforcement-gap-closure PR A adds a `prototype-isolated` dep-cruiser rule
forbidding exactly that). Giving it a `@rtc/testids` dependency would breach
that isolation for no benefit — it is a design-fidelity port, not a tested
product surface, and its test IDs are not consumed by any registry-guarded
tier. **Excluded**, and gate 1's extended scope must **not** include
`packages/client-prototype/src`. If the prototype's isolation is ever
intentionally relaxed, revisit; until then, leaving its literals inline is the
correct call.

---

## 7. Impact on other test tiers (safety net)

- **Visual goldens: no impact expected.** Test IDs are `data-testid` /
  `testID` attributes; they are not rendered pixels. No golden should change.
  If any golden diff appears during execution, it signals an accidental
  markup change and must be investigated, not blessed.
- **UI contract tests (`*.contract.spec.ts`) and Playwright e2e are the safety
  net.** They query by the registry values; if a migration edit changes an
  attribute value by mistake, these tiers fail loudly. Run the full contract
  tier and e2e after each domain migration, not just at the end.
- **RN:** RN currently has no visual-golden tier wired (deferred), so the RN
  safety net is its contract/unit tests plus manual `dev:ios` verification.

---

## 8. Acceptance criteria

1. `@rtc/testids` exists, builds, typechecks, tests, and passes
   `check:scripts` / `check:deps` / `lint:dead` / `check:versions`.
2. `grep -rnE 'data-testid="[a-z]' packages/client-react/src` and
   `grep -rnE 'testID="[a-z]' packages/client-react-native/src` each return
   **zero** matches (excluding `*.test.*`/`*.spec.*`).
3. Every migrated dynamic attribute calls a `TESTIDS.*` builder; no inline
   template strings for IDs remain.
4. Gate 1 (extended) FAILs on a probe literal in each client and PASSes after
   revert (outputs recorded).
5. Full gauntlet green: `pnpm check`, both ESLint configs, `pnpm lint:css`,
   `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, UI-contract coverage,
   `pnpm check:deps`, `pnpm --filter tests gates`, `pnpm check:doc-links`.
6. Visual goldens unchanged (no regeneration performed or needed).
7. `@rtc/client-prototype` untouched; its 8 literals remain inline by design.

---

## 9. Out of scope

- Renaming any test-ID value.
- Executing gate 1's `tests/`-tree behaviour changes beyond the additive scope
  widening.
- The prototype island.
- Any component behaviour, styling, or wire-protocol change.
