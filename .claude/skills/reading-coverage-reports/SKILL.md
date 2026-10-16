---
name: reading-coverage-reports
description: Use when reading or acting on the published coverage report, the ui (visual reach) tiers, or visual engine parity — what each tier measures, why the React and Solid percentages are not comparable, and three traps that make a gap look covered or a covered file look like a gap.
---

# Reading the coverage reports

Refresh the report first — see "Published Reports Are Stale By Default" in the root `CLAUDE.md`.

**The `ui (visual reach)` tiers are not the pixel tiers' coverage.** Each is a
vitest-browser instrument that walks the **same shared scenario matrix** as its
client's playwright golden tier while istanbul watches, so react's ~77% means
*"~23% of `src/ui` is never rendered by any golden scenario"*. That is the
guarantee the pixel tier isn't quietly testing less than assumed — work it DOWN
by adding scenarios; do not dismiss it. `EqDepthDock` at 0% is why
`equities/depth-dock-empty` exists. See
`packages/client-react/tests/ui/visual/COVERAGE-GAPS.md`. These were named
`ui (visual)` until 2026-07-26, which read as "the visual tier's own coverage"
and got the metric written off as worthless once already; the URL slug is still
`ui-visual` so old report links keep resolving.

**Engine parity is a number, not an eyeball.** Every layout state in the
visual matrix is shot twice — `X` (in-house engine) and `X-dockview` — and
`pnpm visual:engine-parity [--set react-local/darwin-arm64] [--budget n]`
diffs each pair with Playwright's own metric into a scenario × skin table
(`tests/scripts/visual-engine-parity.ts`; report-only, like `visual:jitter`).
A whole ROW high means the layout state itself diverges; one COLUMN high is a
skin-specific paint difference (the 3D-skin transparent card fill was one).
Adding a layout state to the matrix means adding BOTH twins; they are seeded
through `AppData.layoutMaximized` / `layoutCollapsed`, never a click — the
visual host's layout intents are deliberate no-ops.

**Don't compare the two clients' reach percentages directly** — each
denominator is its own compiled `src/ui`, and Solid's compiler emits a
different statement count for equivalent JSX. The comparable signal is *which
files* sit at 0% on one side but not the other: identical scenarios, so that
means one client has a render path the other lacks.

Three traps when reading the report:
1. The ~88 `*.module.css` rows sit at 0% but carry **zero statements** (a v8
   `PARSE_ERROR` on non-executed files — harmless, and they do not drag any
   percentage down).
2. A file can read 0% in one tier while fully covered in another
   (`appHeadRegistry` was 0% contract / 100% visual). Check the other tiers
   before concluding something is untested.
3. **A passing gate does not mean no gaps.** Gates assert an AGGREGATE, which
   cannot surface one weak file: `solid/ui (contract)` reported 99.36% overall
   while `appPanelRegistry` sat at 56% and `appHeadRegistry` at 69%. Only this
   per-file report shows that — which is the whole reason it exists.
