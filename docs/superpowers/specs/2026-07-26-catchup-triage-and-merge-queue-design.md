# Catch-up triage sharpening, and a conditional merge queue

## Problem

`main` moves while a PR is green. `shipping-repo-changes` Rule 3 handles that by
hand: triage what landed, catch up only on overlap. The catch-up costs a full CI
cycle, and against a fast-moving `main` it can need repeating.

[IDEAS.md](../../IDEAS.md) proposed replacing that triage with a **GitHub merge
queue** and deferred it to "a proper brainstorm — this is a workflow policy
change, not a quick config toggle." This is that brainstorm.

Measuring first changed the conclusion.

### What the numbers say

Over the last 59 PR merges to `main` (2026-07-26):

| metric | value |
|---|---|
| PRs that contained a catch-up merge | **17 / 59 (29%)** |
| median CI run | **10.1 min** |
| average catch-up tax per PR | **~2.9 min** |

Files appearing in those 17 catch-up PRs:

| file | occurrences |
|---|---|
| **`docs/STATUS.md`** | **9** |
| `pnpm-lock.yaml` | 4 |
| `CoreScene.tsx` / `coreGeometry.ts` / `buildNativePorts.ts` | 3 each |
| `CLAUDE.md` | 3 |

**`docs/STATUS.md` alone accounts for 53% of all catch-ups** — and every one of
those overlaps auto-merged cleanly. They were not conflicts. They were Rule 3
being applied to the letter ("shared file ⇒ catch up") on prose that has no
semantic-conflict path to code.

### Two recorded blockers were stale

IDEAS.md lists prerequisites that no longer hold. Verified 2026-07-26:

- *"Requires branch protection with required status checks… today there's no
  review gate"* — **false.** An active ruleset on `main` (no bypass actors)
  already requires a PR, restricts merges to `allowed_merge_methods: ["merge"]`,
  and requires both CI jobs. `required_approving_review_count` is `0`, which is
  what keeps Rule 4's no-human-gate policy working.
- *"local `main` auto-pushes to origin — direct pushes bypass a queue"* —
  **not true in this checkout.** `.git/hooks` holds only Git LFS hooks. The
  auto-push behaviour is specific to the sandbox environment. Direct pushes to
  `main` are already impossible here (PR rule, no bypass).

So the queue is a smaller step than recorded — but also a less valuable one,
because the tax it would replace is smaller than assumed.

### The cost the queue actually adds

A merge queue charges a CI run on **every** merge. Today **71% of merges pay
nothing** (green branch, disjoint diff, merge as-is). Naively adopted, a queue
raises the average per-PR cost from ~2.9 min to ~10 min — roughly 3× worse for
throughput. It only nets out through batching (several PRs verified in one run)
or by requiring a cheaper check set in-queue than on the PR.

## Goals

- Cut the catch-up tax without adding infrastructure or latency.
- Keep Rule 3's judgment-based compromise; make it better-informed, not blunter.
- Leave a measured basis for deciding on a merge queue later.

## Non-goals

- Eliminating the stale-merge hole in Phase A. That is what Phase B is for.
- `strict_required_status_checks_policy: true`. It forces a catch-up on every
  PR whenever `main` moved — unconditional cat-and-mouse, the exact thing Rule 3
  exists to avoid. Stays `false`.
- Any change to Rule 4 (merge when green, no human gate) or Rule 5 (merge
  commits only).

## Decisions (locked with user)

1. **Phase A now, Phase B conditional.** Sharpen Rule 3 first because it is free
   and attacks 53% of the problem; revisit the queue on measured residue.
2. **If Phase B happens, the queue requires a fast subset** — only
   `typecheck · test · build · gates` (~5 min), leaving `e2e` gating the PR
   itself. Semantic conflicts surface in types, unit tests and architecture
   gates; the slow browser tier does not need to run per queue entry.
3. **`strict_required_status_checks_policy` stays `false`** in both phases.
   Under a queue it is redundant — the queue verifies the combined state
   directly — and setting it `true` would force branches up to date just to
   enter a queue whose purpose is that they need not be.

## Design

### Phase A — sharpen Rule 3 (this spec's implementation)

Rule 3 already asks the right question: *"can I cheaply convince myself these
two changes can't collide?"* It then answers it with a file-overlap heuristic
that is too coarse. The change names the dominant case:

- **Prose-only overlap is not overlap.** When **every** shared file matches
  `**/*.md`, merge as-is. Different sections of `STATUS.md` cannot
  break code, and a genuine textual conflict is still blocked by git regardless.
  The glob is stated exactly because the boundary matters: `CLAUDE.md` (3
  occurrences) counts as prose — it is instructions, not executable — while
  `.claude/settings.json` does **not**, being JSON that changes tool behaviour.
  This is deliberately the same prose set as `visual.yml`'s `paths-ignore`,
  minus `.claude/**` for that reason.

  **Amended 2026-07-26 after final review:** originally `**/*.md` or
  `docs/**`; `docs/**` was dropped because it contains deployed, ungated
  artifacts — 24 `.html`, 9 `.svg`, 6 `.js`, 5 `.css` and LFS media, with
  `docs/pages/`, `docs/presentations/`, `docs/showcase/` published to
  gh-pages on push to `main` (`publish-site.yml`) and `docs/design/**/*.html`
  deployed to Vercel, none behind a CI gate. The `docs/**` glob had been
  borrowed from `visual.yml`'s `paths-ignore`, where the claim is "cannot move
  a rendered pixel" — a different and weaker claim than "no semantic-conflict
  path." Narrowing costs nothing measured: every catch-up in the data was
  `docs/STATUS.md` (9) or `CLAUDE.md` (3), both already covered by `**/*.md`
  alone. Also added: markdown is not exempt when `check:doc-links`-relevant
  content changed (a renamed heading, or a moved/renamed doc) or when the
  `.md` file is generated (e.g. `docs/lint-warnings.md`) — catch up in those
  cases.
- **Overlap still means catch up** when a shared file is code, a lockfile,
  config, a fixture, or CI — anything with a real semantic-conflict path.
  `pnpm-lock.yaml` (4 occurrences) is the case that genuinely warrants it.
- **Carry the evidence in the rule** — the 29% / 53% / 10.1-min figures, so the
  next reader does not re-derive them, and the counter-example (a green PR-CI
  that reddened `main` during the SolidJS port) so the residual risk is not
  forgotten.

Expected effect: catch-ups fall from ~29% to ~15% of PRs. No infrastructure, no
new latency, reversible by reverting one file.

### Phase B — merge queue (conditional, not built here)

Adopt only if the residual tax justifies it. Shape if adopted:

- Add a `merge_queue` rule to the existing `main` ruleset.
- Queue-required check: `typecheck · test · build · gates` only.
- Keep `e2e` required on the PR, not in the queue.
- Keep `strict_required_status_checks_policy: false`.
- Rule 3 then collapses to "enqueue" — the triage disappears entirely, and the
  untested-combined-state hole closes structurally.

**Open feasibility question, must be answered before building:** whether GitHub
merge queue is available on a **user-owned** public repo. The docs emphasise
organisations; this repo is public but owned by a user account, not an org.
IDEAS.md's note ("available for public repos and Team/Enterprise orgs") is
ambiguous on exactly this case. Verify before any further design.

**Second known risk:** this repo's fine-grained PAT `403`s on `gh pr checks` /
`statusCheckRollup`. Merge queue leans on the same check-rollup APIs, so tooling
friction is likely to resurface in whatever polls queue state.

## Verification

Phase A is a documentation/skill change; there is nothing to unit-test. It is
verified by use:

- `pnpm check:doc-links` passes (the rule cites files by relative link).
- Re-run the catch-up measurement after ~2 weeks of merges. Success is the
  catch-up rate dropping toward ~15% **with no increase in post-merge `main` CI
  failures**. The second half matters more than the first: if `main` starts
  reddening, the rule was loosened too far and Phase B's case is made.

Measurement command (the one that produced the table above):

```bash
git log -60 --first-parent main --format="%H" | while read -r c; do
  git log -1 --format="%s" "$c" | grep -q "Merge PR #" || continue
  git log "$c^1..$c^2" --oneline 2>/dev/null \
    | grep -qi "Merge remote-tracking branch 'origin/main'" && echo x
done | wc -l
```

## Rollback

Revert the SKILL.md change. No infrastructure is touched, no ruleset is
modified, and no in-flight PR is affected.

## Risks

- **Loosening the rule lets a real conflict through.** Mitigated by scope: the
  exemption covers only markdown/docs, where no semantic-conflict path to code
  exists. Code, lockfiles, config, fixtures and CI still trigger a catch-up.
- **The stale-merge hole stays open in Phase A.** Accepted deliberately.
  `strict: false` means a green-but-stale PR can merge into a `main` it was
  never tested against; post-merge `main` CI is the backstop and has caught this
  before. Phase B is the real fix, deferred on cost grounds, not dismissed.
- **The measurement may not reproduce.** 59 merges is a small sample from one
  busy period. If the catch-up rate is materially different next time, re-derive
  before acting on the old numbers.
