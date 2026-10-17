# Ideas — Icebox

> Speculative ideas and wishlist items — things worth writing down before they're
> forgotten, but **not yet committed to**. No spec, no plan, may never happen.
>
> This is the *upstream* of [`STATUS.md`](STATUS.md). When an idea earns a spec
> or plan, **move** it out of here into `STATUS.md` (with a link to its plan) —
> don't leave it in both places. This file only ever holds things that have *not*
> graduated. For the full document map, see [`README.md`](README.md).

An idea's lifecycle:

```mermaid
flowchart TD
    I["💡 <b>IDEAS.md</b><br/><i>icebox — may never happen</i>"]
    S["📝 spec / plan<br/><i>docs/superpowers/{specs,plans}</i>"]
    T["🗂️ <b>STATUS.md</b><br/><i>committed, pending work</i>"]
    D["🚀 shipped"]
    G["🗑️ removed<br/><i>git log is the history</i>"]

    I -->|earns a spec/plan| S
    S --> T
    T -->|merged to main| D
    D --> G
```

---

## Jarvis

### Generative-UI compositions (post-L1/L2 riffs)

Compositions of shipped systems with the panel surface, noted 2026-08-09 while
surveying what generative UI could become — each rides the roadmap
([architecture §19](architecture/19-ai-capability-roadmap.md)) rather than
adding to it: **narrator × panels** (an anomaly narration *offers* a chart
panel — the offers-never-executes persona clause already anticipates the
handshake); **sentinels × panels** (a standing watcher renders its own live
panel showing trigger proximity); **drive × panels × narrator** (a "morning
briefing" turn that rearranges the workspace, spawns overnight-movers panels
and narrates them — three shipped systems in one choreographed turn); and
**renderer-vocabulary growth** (depth ladder, correlation matrix, PnL
waterfall — each closed-vocab `PanelSpec` kind multiplies what every future
feature can express without ever granting the model arbitrary UI power).

### Generative-UI standards adapter (A2UI / MCP Apps)

Expose the Jarvis panel surface to external hosts through an emerging
agent-UI standard — a server-side `PanelSpec` ↔ standard-messages adapter, the
same boundary move as the `/mcp` endpoint. Assessed 2026-09-10 and deliberately
**not** adopted as the internal contract (pre-GA specs, unsettled standards
race, our domain vocabulary is stronger than the generic catalogs); evaluate
MCP Apps before A2UI if an interop round ever happens. Full comparison:
[research/2026-09-10-a2ui-genui-standards-landscape.md](research/2026-09-10-a2ui-genui-standards-landscape.md).

## Tooling & workflow

### Adopt a GitHub merge queue

**Decided 2026-07-26: not available to this repo** — GitHub merge queue needs an
organization-owned repository and this one is user-owned. Rule 3's manual
catch-up triage in the [`shipping-repo-changes`](../.claude/skills/shipping-repo-changes/SKILL.md)
skill is the permanent mechanism. Revisit only if the repo moves to an
organization; measurements and the full amendment live in the
[design spec](superpowers/specs/2026-07-26-catchup-triage-and-merge-queue-design.md).


### RN sibling `X.styles.ts` split

Move each component's `StyleSheet.create` block to a sibling `X.styles.ts`,
mirroring the web clients' `.module.css` co-location. Cosmetic symmetry; 69
files. Deliberately deferred 2026-09-01 (chose lint-gaps-only) — see
[`rn-styling.md`](rn-styling.md).

### RN styling library evaluation

Only worth revisiting if a real limitation of `StyleSheet.create` +
`useThemedStyles` appears (e.g. web+native single-source styling) — then
consider react-native-unistyles / react-strict-dom. Deferred 2026-09-01 — see
[`rn-styling.md`](rn-styling.md).


### Devtools `bind()` layer

A thin reactive-bindings layer over `InspectorStore` (the devtools analogue of
`react-bindings`), replacing the `useSyncExternalStore` seam and folding
`useTimeline`/`useNavigation` `useState` view state into store-backed selectors.
Considered 2026-09-01, deferred: real work for an 11-component UI already holding
≥95% coverage. Revisit if the inspector grows enough view state to make
prop-drilling or render-scope bugs recur.


### Split `CLAUDE.md` into a shared `AGENTS.md`

Only worth doing if a second coding agent (e.g. Codex) becomes a regular tool
here. Assessed 2026-10-03, deferred: nothing but Claude Code reads the repo's
instructions today.

Verified that day against the vendors' docs
([Claude Code](https://code.claude.com/docs/en/memory#agents-md),
[Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md)):

- **Claude Code** (v2.1.277+) reads `AGENTS.md` natively, but only when no
  `CLAUDE.md` / `CLAUDE.local.md` exists at or above the working directory.
  With both present it reads `CLAUDE.md` only, unless that file imports
  `@AGENTS.md`.
- **Codex** (checked against codex-cli 0.160.0) reads `AGENTS.override.md` then
  `AGENTS.md`, walking from the git root down to the cwd. It never reads
  `CLAUDE.md` unless `~/.codex/config.toml` sets
  `project_doc_fallback_filenames = ["CLAUDE.md"]`.
- **Codex caps** combined instructions at 32 KiB (`project_doc_max_bytes`), and
  `CLAUDE.md` was 45 KB, so the fallback alone would not load it whole.
- **Codex documents no `@import`**, so sharing only works one way: `CLAUDE.md`
  importing `AGENTS.md`.

The shape, if it happens: move the tool-neutral content (build commands,
package structure, dependency rules, test-fixture and naming doctrine) into
`AGENTS.md`, and keep `CLAUDE.md` as `@AGENTS.md` plus the Claude-only sections
(slash commands, `.claude/` authoring traps). That keeps the ~96 files
referencing `CLAUDE.md` valid, and works on Claude Code versions that cannot
read `AGENTS.md` directly.

What does not carry over: `.claude/` commands, skills, hooks and permissions
are Claude-only, so hook-enforced guardrails (e.g.
`split-outward-commands.py`) would not apply under Codex.

Zero-change trial: set the fallback plus `project_doc_max_bytes = 65536` in the
user's own Codex config — no repo edit needed.


### Shrink the repository (screenshot history)

The GitHub repo is **1.96 GB** and nearly all of it is old PNG versions, not
code. Measured 2026-10-17 (on-disk, delta-compressed sizes from
`git rev-list --objects <ref> | git cat-file --batch-check='%(objecttype) %(objectsize:disk) %(rest)'`):

| History of | Size |
|---|---|
| `packages/ui-contract/goldens` (visual goldens) | 1,291 MB |
| `packages/client-react/tests/ui` — **path no longer exists** (goldens moved) | 419 MB |
| `packages/client-react-native/tests` (RN goldens) | 134 MB |
| all code, docs, lockfiles | ~50 MB |
| `gh-pages` branch (547 commits of published reports) | 266 MB |

The current tree is only ~360 MB of images, so ~1.5 GB is dead history. PNGs
are already compressed, so git cannot delta them: every regeneration stores
every changed golden whole. Two full sets are committed — `react/` (2,012
files, the CI x86 set) and `react-local/darwin-arm64/` (2,107 files) — so each
visual change is paid twice. Since August the goldens churn at ~2,600 PNG
writes a month (~80 KB each, so very roughly ~200 MB/month).

Options, cheapest first. Not urgent — GitHub's guidance is under 1 GB ideal,
under 5 GB strongly recommended — but the first three stop the growth:

1. **Partial clone** (no repo change): `git clone --filter=blob:none` fetches
   old blobs on demand, so a fresh clone costs about the current tree. CI
   already checks out shallow.
2. **Publish `gh-pages` as a single orphan commit** (force-push) instead of
   appending — Pages serves only the tip, so its history is worthless and
   grows on every push to `main` (`visual.yml`, `publish-site.yml`,
   `coverage-report.yml`).
3. **Cut golden churn.** Decide whether `react-local/darwin-arm64` needs to be
   committed at all (git-ignored or regenerated on demand would roughly halve
   future growth); losslessly recompress PNGs (`oxipng`) in
   `update-visual-goldens.yml` — Playwright compares decoded pixels, so
   results are unchanged.
4. **Move goldens out of the repo** (separate repo/submodule or object
   storage keyed by a committed hash manifest) — stops screenshot growth
   entirely; a real project.
5. **One-time history rewrite** (`git filter-repo`): drop the dead
   `client-react/tests/ui` path and superseded golden versions — likely well
   under 1 GB. Costs: every SHA changes (`CHANGELOG.md`, `STATUS.md`, docs and
   the weekly tags cite them), every open PR and worktree breaks, and GitHub
   keeps old objects reachable via `refs/pull/*` until Support purges them.
   Only worth doing once, after 2–4, or it regrows.

**Not LFS.** Moving goldens to Git LFS looks like the fix but is worse here:
`visual.yml` needs the full ~330 MB set on every push to `main`, and LFS
downloads from Actions are metered against the account's LFS bandwidth quota,
while a plain shallow checkout is free; LFS storage also keeps every version;
and any checkout without `lfs: true` gets pointer files, which fail the pixel
comparisons with misleading errors. LFS stays scoped to rarely-changing design
media and decks (`.gitattributes`).
