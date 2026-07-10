# Architecture Docs Expansion — the Codebase Atlas

- **Date:** 2026-07-10
- **Status:** Approved (user-validated design, this session)
- **Phase:** 2 of the architecture-docs workstream. Phase 1 (PR #148, merged)
  split `docs/architecture.md` into per-section files under `docs/architecture/`.
- **Related:** [`docs/architecture.md`](../../architecture.md) (hub),
  ADRs 001–004, `docs/dependency-cruiser.md`.

## 1. Problem

Almost 100% of this codebase is AI-written. The human maintainer needs to
orient quickly — which packages exist, how modules and layers wire together,
what is composed into which app, what is reused across apps
(client-react vs client-react-native vs planned client-solid vs server),
and how control and information flow. The existing §1–§12 reference is
accurate but is a *reference*, not a *map*: it answers "what is the
architecture" but not "where am I, and which route do I walk for this
errand." The analogy driving the design: a multi-level mall/airport/tube
map — same territory at several zoom levels, plus signposted routes.

## 2. Goals / Non-goals

**Goals**

1. Multi-zoom orientation maps (system → package → module) with a
   reuse-across-apps matrix.
2. Composition & wiring documentation per app (adapter tables, boot
   sequences).
3. Explicit control-flow vs information-flow walkthroughs for the main
   user journeys.
4. Task-oriented "trailheads" (recipes with change-impact checklists).
5. Expanded "why" narratives for the key design decisions.
6. A README.md in every package — the map detail closest to the code.
7. Keep the whole doc set link-sound mechanically (CI gate).

**Non-goals**

- No restructuring of existing §1–§12 beyond §10's in-place expansion and
  small cross-links into the new sections.
- No code changes (the only executable addition is the docs link checker).
- No exhaustive per-file inventories except where a folder *is* an
  inventory (see anti-drift rules).
- Historical docs (`docs/superpowers/plans/`, STATUS.md logs, ADR bodies)
  are not rewritten.

## 3. Deliverables

### 3.1 Hub index — `docs/architecture.md`

A "How to read this" block above the TOC with three entry paths:

- **New here** → §1 Overview → §13 Codebase Map → your app's package README.
- **Need to change something** → §16 Trailheads.
- **Need the deep reference** → §2–§9 as today.

One short paragraph per path. No content duplicated from sections. The TOC
gains entries for §13–§16.

### 3.2 §13 Codebase Map — `docs/architecture/13-codebase-map.md`

- **L0 system map** — one diagram, whole system on one screen: the two
  shipping apps + planned Solid client + server, the shared column
  (client-core / react-bindings / domain / shared / ws-effects), the two
  runtime modes (in-process simulators vs WebSocket). An animated SVG is
  appropriate here if motion clarifies mode switching; otherwise static.
- **L1 package map** — the 9 packages + the `tests` workspace as a line
  map. Per package, one card: what it is, its ring (§1.3 terminology),
  depends-on, consumed-by, one non-obvious fact. Cards link to the
  package READMEs.
- **L2 module maps** — the *shape* of each package's `src/` (folder →
  module tables) shown in compressed form; the authoritative detail lives
  in the package READMEs (§3.7). No duplication: §13 shows structure and
  links, READMEs carry the one-liners.
- **Reuse matrix** — rows = shared modules/layers (ports, use cases,
  presenters, machines, simulators, WsAdapter, theme, wire protocol,
  effects framework…), columns = client-react / client-react-native /
  client-solid (planned) / server. Cells: used-verbatim / adapted /
  not-used, with footnotes. Ends with "what each app adds on top" lists.

### 3.3 §14 Composition & Wiring — `docs/architecture/14-composition-and-wiring.md`

- **Composition-root walkthrough** — `createApp()` in
  `packages/client-core/src/composition.ts`: construction order, what is
  injected where, where presenters/machines get their ports. Verified
  against source at write time.
- **Per-app adapter tables** — web vs RN vs server: which ports get which
  adapter on each platform, which implementations are shared verbatim,
  which are platform-specific (persistence, WS transport, theming…), and
  where simulator-vs-WS mode selection happens for each app.
- **Boot sequences** — per app, from entry point (`index.html` / Expo
  entry / server main) to first rendered tick: startup control flow
  including BootGate/LockScreen and connection establishment. One
  sequence-style diagram per app plus numbered prose naming real files.

### 3.4 §15 Flows — `docs/architecture/15-flows.md`

- Opens with the control-flow vs import-direction vs data-flow
  distinction, stated once (calls go outward-in-and-back-out, imports
  always point inward, data rides streams).
- Walkthroughs (each: one layered/swimlane diagram + numbered prose steps
  naming real files):
  1. Connection lifecycle — connect, retry, status propagation.
  2. FX trade execution end-to-end — button intent → machine → use case →
     RPC → ack → blotter row.
  3. Credit RFQ lifecycle across layers.
  4. Equities order lifecycle over the wire.
  5. Admin telemetry — the simulator-only family (no wire protocol).
- The price tick keeps its animated §7 treatment; §15 links to it rather
  than duplicating.

### 3.5 §16 Trailheads — `docs/architecture/16-trailheads.md`

Task recipes, each = route through the layers **in order** + a
change-impact checklist (which tests, gates, and goldens the change
touches):

1. Add a currency pair.
2. Add a port + adapter + simulator (full port family).
3. Add a wire message — shared protocol + server effect + client adapter.
4. Add a UI panel to web and/or RN.
5. Add a package to the monorepo — including the gates that MUST be wired
   on package add (typecheck script, knip entry, name-specific
   eslint/tsconfig paths; per the all-gates-global policy).

Recipes remind the reader which inventory tables (§3.7 anti-drift rule)
must be updated when the recipe is executed.

### 3.6 §10 expansion (in place) — `docs/architecture/10-key-design-decisions.md`

From the current ~29-line table to per-decision narratives: the problem,
the choice, alternatives rejected and why, the accepted cost, link to the
ADR where one exists. Decisions to cover at minimum: RxJS as the boundary
stream type; ports live in domain; ViewModel seam / no DI in the UI; dumb
UI; simulators as production code; ws-effects declarative server; monorepo
+ workspace layout; CSS Modules over inline styles; visual goldens as the
framework-swap contract; the tests workspace / ten-suite stack rationale.
The existing table stays as the summary at the top.

### 3.7 Per-package READMEs — `packages/*/README.md` (9 packages)

Shared template so they read as one system:

1. **Identity card** — name, one-sentence purpose, ring, runtime deps and
   the policy behind them, consumers (who imports it), boundary rules that
   apply to it with the gate numbers that enforce them.
2. **Folder map** — `src/` tree to module level, one-liner per entry;
   significant files named individually, routine ones grouped ("one
   presenter per domain slice").
3. **Entry points** — the 2–4 files that reveal the package's shape, in
   reading order.
4. **How it's used** — a short usage snippet from the consumer's
   perspective, verified against real source.
5. **Links** — its §13 card, relevant §15 flows, trailheads routing
   through it.

**Reconciliation:** the 3 existing READMEs (client-react,
client-react-native, client-prototype) keep all current operational
content; the template sections wrap around it. No information deleted.

### 3.8 Docs link checker — `scripts/check-doc-links.mjs` + CI step

Promotion of the phase-1 verification script: resolves every relative
link and `github-slugger` anchor across the repo's markdown (scoped to
`docs/**`, `README.md`, `CLAUDE.md`, `tests/**.md`, `packages/*/README.md`).
Fails CI on a missing file or anchor. Root dev-dep: `github-slugger`
(subject to the 24h dep-freshness cooldown check). Wire as a CI step
alongside the existing docs-adjacent gates; runnable locally via a root
script named `check:doc-links` (root-only script — it is repo-wide, not
per-workspace, so the PR #146 per-workspace meta-gate does not apply to it).

## 4. Conventions

- **Diagrams: liberal use.** As many as aid comprehension (user
  directive). Static Mermaid + static SVG are the default carriers;
  animated SMIL SVGs where motion genuinely clarifies (flows, mode
  switches) — following the two existing examples' conventions
  (`dur` + `repeatCount="indefinite"`, keyPoints/keyTimes loops).
- **Mermaid discipline:** §2 palette (blue UI / purple bindings / green
  core / amber server+effects / slate domain+shared / gray actors),
  dark-theme-safe saturated fills + white text, ~4–5 siblings per rank
  max, quote pipe labels containing `()`. Validate every block with the
  Mermaid MCP validator before commit (known quirk: edge-less
  classDiagrams false-fail the validator).
- **Truthfulness:** every named file, symbol, count, and snippet verified
  against source at write time. Writers cite `path:line` in working notes;
  doc prose stays clean. No fictionalized code (the §2.3.1 lesson).
- **Anti-drift:** descriptions state roles and boundaries (stable), not
  volatile inventories or counts; exhaustive listings only where a folder
  is literally an inventory (`domain/src/ports/`, `domain/src/simulators/`,
  `server/src/effects/`) and trailhead recipes name the tables to update.
- **Anchors/links:** heading anchors verified with the real
  `github-slugger`; ` -- ` slugs to four dashes; the link checker (§3.8)
  is the mechanical backstop.

## 5. Execution shape

- One branch/worktree, **one PR** for the whole phase, user-reviewed
  before merge (same as PR #148).
- Content production parallelized over disjoint files via subagents
  (9 READMEs + 4 new sections + §10 + hub + link checker are naturally
  disjoint); every subagent brief demands source-verification and the
  conventions in §4.
- One full local gauntlet before push (Biome, ESLint both configs,
  stylelint, typecheck, knip, tests as applicable — docs-heavy PR, but the
  link checker and CI wiring touch script/CI surface).
- Mermaid validation pass + link-checker pass are blocking before push.

## 6. Acceptance criteria

1. §13–§16 exist, are TOC'd from the hub, and follow §4 conventions.
2. §10 covers at minimum the ten listed decisions with
   problem/choice/alternatives/cost/ADR-link structure.
3. All 9 packages have READMEs matching the template; the 3 pre-existing
   READMEs lost no content.
4. Reuse matrix covers all shared layers × 4 columns.
5. `scripts/check-doc-links.mjs` runs locally and in CI and passes on the
   final tree.
6. Every Mermaid block validated; every animated SVG loops correctly.
7. Spot-audit: any 10 named files/symbols sampled from the new docs exist
   at the stated paths.
