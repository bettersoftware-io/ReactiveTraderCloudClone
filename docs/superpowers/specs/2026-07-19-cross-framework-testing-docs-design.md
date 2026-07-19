# Cross-Framework Shared-Testing Documentation — Design

**Date:** 2026-07-19
**Status:** Approved scope: new synthesis chapter + gap patches + animated SVG + showcase HTML page.

## Problem

Since the SolidJS port shipped (PRs #180–#262), one test suite proves two web
clients equivalent three independent ways — shared `*.contract.spec.ts` specs
via a per-framework swap-trio, three assert-only visual tiers against
`client-react`'s goldens, and the same Gherkin e2e suites via
`RTC_CLIENT_PKG`. A documentation audit (2026-07-19) found:

- **No single document tells the story end-to-end.** §8.1 states all three
  mechanisms in one sentence; the "how" is split across ~6 per-tier docs.
- **The e2e mechanism is a hole**: no maintained doc names `RTC_CLIENT_PKG`
  or explains that one env var re-parameterizes the dev server so the same
  suites drive either client. It lives only in source comments.
- **The contract tier has no diagram anywhere** (visual has 9 mermaid across
  its docs; e2e has 2).
- **ADR-001 naming trap**: the goldens-as-portability ADR lives at
  `packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md`;
  `docs/adr/` jumps 002→005, so a reader looking in the obvious place finds
  nothing.
- `docs/showcase/README.md` still says "Nothing here is deployed", but
  `publish-site.yml` now auto-publishes the showcase to the project Pages
  site (PR #277) — stale note.

## Deliverables

### D1 — New chapter: `docs/architecture/21-cross-framework-testing.md`

Title: **"§21 One Test Suite, Two Frameworks — the Cross-Framework Testing
Architecture"**. The extensive synthesis. Follows the house style of the other
`docs/architecture/NN-*.md` chapters (numbered section headings, back-link to
`architecture.md`). Sections:

1. **The claim and the scoreboard.** What "full parity" means, with live
   numbers *verified at write time* (do not copy blindly): 84 of 86
   `*.contract.spec.ts` files shared (607 tests on Solid, 614 on React — the
   two `shell/auth` specs are react-only), 1252 visual scenarios × 3
   assert-only tiers, the shared Gherkin e2e suites. One table.
2. **Overview diagram.** The one picture that exists nowhere today: a tall
   mermaid showing the three sharing modes side-by-side — shared spec source →
   two swap-trios; shared scenario manifest → three tiers × two clients → ONE
   golden tree (react-owned); shared feature files → `RTC_CLIENT_PKG` → either
   dev server. ≤4–5 boxes per rank; stack lanes vertically (invisible links if
   needed).
3. **Mechanism 1 — the contract swap-trio.** Real code fragments (short, 5–15
   lines each, elided with `…` where long):
   - the driver seam: `packages/ui-contract/src/shared/harness/activeDriver.ts`
     (`UiContractDriver` interface + `setDriver`/`getDriver`);
   - the two trios are the identical eight filenames:
     `packages/client-react/tests/ui/contract/react/` vs
     `packages/client-solid/tests/ui/contract/solid/` (side-by-side listing);
   - the *only* per-client difference: each client's contract vitest config's
     `setupFiles` pointing at its own trio's `setup.ts`;
   - one shared spec excerpt showing it imports nothing framework-specific.
   Plus a small mermaid for this tier (also reused in D4c).
4. **Mechanism 2 — assert-only visual tiers.** Code fragments:
   - `packages/ui-contract/src/visual/scenarios.ts` (shared manifest both
     clients loop over) + `goldenPath.ts` (shared golden-path resolver);
   - the cross-package anchor: `snapshotDir` in
     `packages/client-solid/tests/ui/visual/playwright/playwright.config.ts`
     resolving into `../../…/client-react/…/__screenshots__`;
   - the three assert-only guards (existsSync throw in the vitest resolver;
     `updateSnapshots: "none"`; the `arg.startsWith("-u")` argv guard) and
     *why* each exists (vitest silently auto-creates missing goldens; Playwright
     accepts `-u`, `-u=X`, `-uX`);
   - the key sentence: **client-solid owns zero goldens — that's what makes a
     pixel match a proof rather than a coincidence.**
   A tall mermaid: manifest → 2 clients × 3 tiers → one golden tree.
5. **Mechanism 3 — e2e via `RTC_CLIENT_PKG`.** The previously-undocumented
   plumbing:
   - `tests/scripts/devServer.ts`: `CLIENT_PKG = process.env.RTC_CLIENT_PKG ??
     "@rtc/client-react"` → `spawn("pnpm", ["--filter", CLIENT_PKG, "dev"])`;
   - `tests/browser/playwright/playwright.config.ts`: `isSolid` keying ports
     (3005/3006), report/artifact `-solid` suffixes, and `testIgnore` for the
     two react-only specs (`login.spec.ts` — no Solid auth UI as of the audit
     date; `devtools.spec.ts` — `/devtools/` not served by the Solid Vite
     config) — check `docs/STATUS.md` at write time in case a sibling
     workstream has since closed either exclusion, and phrase accordingly;
   - `tests/scripts/run-all.ts`: the 12-suite pool with the two solid suites.
   Mermaid sequence or flowchart (≤6 participants; literal `<pkg>` not HTML
   entities).
6. **The principles that made it possible.** The "which software-engineering
   principles" section, each tied to a concrete repo artifact, not platitudes:
   - **Dependency inversion** — specs depend on `UiContractDriver`, not a
     framework; clients inject the implementation.
   - **Humble object / dumb UI** — ADR-005 + the rxjs-machines refactor made
     views thin enough that a framework port is a `src/ui`-only rewrite.
   - **Single source of truth** — one spec tree, one scenario manifest, one
     golden set, one feature-file tree; duplication is confined to the seams.
   - **Contract at the seam** — the ViewModel member list (both bindings
     packages expose the same ~60 `use*` accessors) and the
     `data-testid`/STRINGS page-object contract are what let the *same* tests
     bind to either implementation.
   - **Parameterize, don't fork** — `RTC_CLIENT_PKG`, `setupFiles`, and
     `snapshotDir` are each a one-point swap; nothing else forks.
7. **What the net actually caught.** Evidence the tiers earn their keep: the
   TileNotional double-fire bug (react's SyntheticEvent dedup has no Solid
   analogue; only the real-browser e2e tier could catch it), and the
   classic-skin CI font non-determinism the visual tiers surfaced.
8. **The fine print.** Honest limits, one place: 2 auth contract specs
   react-only; `login.spec.ts`/`devtools.spec.ts` e2e exclusions; 4
   classic-skin CT assertions skipped CI-only; `useMachine` eager-disposal
   divergence in solid-bindings. Each with its STATUS.md follow-up where one
   exists. (Addresses the "headline stronger than the fine print" review
   minor from PR #240.)
9. **Reading map.** Table pointing at the per-tier authoritative docs (this
   chapter synthesizes; it does not replace them).

### D2 — Animated SVG: `docs/architecture/one-suite-two-frameworks.svg`

Embedded near the top of the chapter. Same idiom as the existing
`docs/architecture/framework-swap.svg`: hand-authored, SMIL animation
(`<animate>`), GitHub-dark palette (`#0d1117` bg, `#161b22` boxes, `#3fb950`
green / `#58a6ff` blue / `#d29922` amber strokes), `<title>` for
accessibility, ~980-wide viewBox. Storyboard (one looping cycle, ~12s):

- Static: a shared **spec/scenario/feature source** box at top; below it two
  client lanes (React left, Solid right); at the bottom a single golden tree
  + a single green "PASS" verdict box.
- Phase A: a pulse travels from the shared source down BOTH lanes
  simultaneously (contract specs into each trio).
- Phase B: both lanes emit a "screenshot" token that converges on the ONE
  golden tree (react-owned, badge "solid owns 0 goldens").
- Phase C: an `RTC_CLIENT_PKG` toggle flips the e2e arrow between the two
  lanes while the feature-file box stays still ("specs unchanged").
- The React-owned golden tree and the shared source boxes get the pulsing
  "UNCHANGED"-style badge treatment from framework-swap.svg.

Constraint: pure SMIL/CSS inside the SVG, no scripts (GitHub strips them);
must render legibly in both GitHub light and dark themes (self-contained
dark background like the precedent, so theme-independent).

### D3 — Showcase page: `docs/showcase/cross-framework-testing.html`

Self-contained single-file HTML per the showcase README contract: inline
CSS/JS only, no external requests, theme-aware (light/dark + manual toggle),
safe to open from disk. Content: an interactive/animated telling of the same
story — e.g. a stepper or auto-playing sequence walking the three mechanisms,
with the real code fragments in styled panes and an animated
"one spec → two frameworks → one verdict" hero. Add a row to
`docs/showcase/README.md` (authoritative doc column → the new §21 chapter),
and **fix the stale "Nothing here is deployed" note** to reflect
`publish-site.yml` auto-publishing.

### D4 — Gap patches to existing docs

a. **`tests/STRATEGY.md`** — in §6 Axis A, add a short "how it runs" block
   naming `RTC_CLIENT_PKG`, the devServer spawn, ports 3005/3006, and the
   `testIgnore` exclusions. Keep the existing conceptual prose.
b. **`tests/README.md`** — add the two solid suites to the suite inventory
   with a sentence on `RTC_CLIENT_PKG`, linking §21.
c. **`packages/ui-contract/README.md`** — add the contract-tier mermaid
   (shared specs → driver seam → two trios), the tier's first diagram.
d. **`docs/adr/ADR-001-visual-diff-tooling.md`** — a ~5-line pointer stub:
   "ADR-001 lives with the code it governs → link", so `docs/adr/` no longer
   jumps 002→005. Must satisfy `check:doc-links`.
e. **Cross-links** — `docs/architecture.md` ToC entry for §21;
   `08-replaceability-matrix.md` §8.1 and `09-test-strategy.md` §9.7/§9.8
   get one-line "deep dive → §21" pointers; `packages/client-react/README.md`
   and `packages/client-solid/README.md` link §21 from their test-portfolio
   sections.

## Constraints (binding on every task)

- **Verify all numbers live at write time** (spec-file counts, test counts,
  scenario count, ports, suite count) — do not trust this spec's numbers.
  Commands: count `*.contract.spec.ts` under `packages/ui-contract`; run the
  two contract suites for test totals only if cheap, else cite the counts
  already printed in `packages/client-*/README.md` and cross-check one.
- **Mermaid rules** (CLAUDE.md + memory): compose tall not wide, ≤4–5 boxes
  per rank; edge-less subgraphs tile side-by-side — connect or `~~~`-stack;
  sequence diagrams ≤6 participants; NO `&lt;`/`&gt;` entities in sequence
  diagrams (breaks GitHub rendering) — use literal `<x>` or quoted labels;
  GitHub ignores subgraph `direction TB` when edges cross the boundary.
- **Diagram verification**: every mermaid block must be validated with
  mermaid-cli (both v10 and v11, strict) AND visually inspected as a rendered
  PNG before commit — the MCP validator is too lenient. The SVG must be
  visually inspected in a browser/renderer.
- **`pnpm check:doc-links` must pass** — it gates every relative md link +
  anchor; heading anchors slug via real `github-slugger` (` — ` and ` -- `
  behavior differ; verify slugs).
- **No behavioral change to any code or CI** — this workstream is docs +
  static artifacts only. `docs/showcase/` and `docs/architecture/*.svg` are
  outside build/test globs; nothing else may change semantics.
- **House voice**: match the existing chapters' register (confident,
  concrete, code-cited, honest fine print). Small fragments (5–15 lines),
  always with a `path:line`-style citation; elide with comments, never
  paraphrase code.
- Chapter number **21** is next free (architecture/ currently ends at 20).
  Verify at write time; renumber if a sibling workstream took it.
- Gauntlet for this branch: `pnpm check:doc-links`, `biome ci .` (md is
  ignored by biome; the showcase HTML may be flagged — match whatever
  exemption pattern the existing showcase pages use), `pnpm lint:actions`
  untouched, full `pnpm build`/`typecheck`/`test` unaffected but run once
  pre-PR as usual.

## Non-goals

- No restructuring of the existing per-tier docs (they remain authoritative
  for their tier; §21 synthesizes and links).
- No moving ADR-001 (the pointer stub is deliberate — the ADR stays with the
  code it governs).
- No new tests, no CI changes, no changes to the mechanisms themselves.
- Not documenting the RN client's test story beyond a passing mention (§21
  is about the two *web* clients; RN has its own workstream).
