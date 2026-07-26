# Catch-up Triage Sharpening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Rule 3 forcing a catch-up CI cycle when the only shared file is prose, which measurement shows is 53% of all catch-ups.

**Architecture:** Documentation-only. Rule 3's file-overlap heuristic gains an explicit prose exemption; `IDEAS.md`'s stale merge-queue note is corrected; `STATUS.md` gains the Phase B follow-up with its measurement command. No code, no infrastructure, no ruleset change.

**Tech Stack:** Markdown. Verified by `pnpm check:doc-links` and by re-running the measurement shell command.

## Global Constraints

- Spec: [`docs/superpowers/specs/2026-07-26-catchup-triage-and-merge-queue-design.md`](../specs/2026-07-26-catchup-triage-and-merge-queue-design.md). Every decision below is locked there.
- The prose exemption is **exactly** `**/*.md` — `CLAUDE.md` counts as prose, `.claude/settings.json` does **not**. (Amended 2026-07-26 after final review: `docs/**` was dropped — that directory holds deployed, ungated artifacts. See the spec's amendment note.)
- `strict_required_status_checks_policy` stays `false`. Do not touch the `main` ruleset.
- Rule 4 (merge when green, no human gate) and Rule 5 (merge commits only) are unchanged.
- Phase B (the merge queue) is **not** built here. It is recorded as conditional.
- All work goes through `./scripts/new-worktree.sh` + a PR, per `shipping-repo-changes`.

---

### Task 1: Sharpen Rule 3, correct IDEAS.md, record the Phase B follow-up

**Files:**
- Modify: `.claude/skills/shipping-repo-changes/SKILL.md` (Rule 3 bullets + the Quick Reference row)
- Modify: `docs/IDEAS.md` (the "Adopt a GitHub merge queue" section)
- Modify: `docs/STATUS.md` (add the Phase B follow-up entry)
- Test: none — documentation. Verified by `pnpm check:doc-links` and a manual re-read.

**Interfaces:**
- Consumes: the measured figures from the spec (29% catch-up rate, 53% from `STATUS.md`, 10.1 min median CI).
- Produces: nothing other tasks depend on. This is the only task.

- [ ] **Step 1: Replace the Rule 3 decision bullets**

In `.claude/skills/shipping-repo-changes/SKILL.md`, find the block beginning
`- **Merge as-is (skip catch-up)**` and ending with the `(b) Too broad to cheaply assess` bullet. Replace those four bullets with:

```markdown
- **Merge as-is (skip catch-up)** — the common case — when the incoming commits are plainly **disjoint** from your change: a different package, docs-only while you touched code, no shared exports / fixtures / lint / build config. `git merge-base --is-ancestor origin/main HEAD` may report "behind," but *behind ≠ risky*. Go straight to Rule 4.
- **Merge as-is even when a file IS shared, if every shared file is prose** — i.e. every path in the overlap matches `**/*.md`. Prose in different sections of a document has no semantic-conflict path to code, and git still blocks a genuine *textual* conflict regardless. `CLAUDE.md` counts as prose (instructions, not executable); `.claude/settings.json` does **not** (JSON that changes tool behaviour). The glob is deliberately narrower than `docs/**`: that directory also holds 24 `.html`, 9 `.svg`, 6 `.js`, 5 `.css` and LFS media, and `docs/pages/`, `docs/presentations/`, `docs/showcase/` publish straight to gh-pages on push to `main` (`publish-site.yml`) while `docs/design/**/*.html` deploys to Vercel — none behind a CI gate, so "prose" there would be true of the wrong claim. A renamed heading or moved/renamed doc is *not* prose-safe either — `check:doc-links` validates cross-file anchors, so branch A renaming a heading + branch B linking the old one auto-merges clean and reds `main`; catch up in that case. Generated `.md` (e.g. `docs/lint-warnings.md`, drift-checked) is likewise not prose. **This is the single highest-value case:** measured over 59 merges (2026-07-26), 17 needed a catch-up and **9 of those 17 — 53% — shared only `docs/STATUS.md`**, every one of which auto-merged cleanly. They were not conflicts; they were this rule read too literally, at ~10 min of CI each.
- **Catch up (merge `origin/main` *in* + re-enter the Rule 2 CI loop)** when **either**:
  - **(a) Overlap with a real semantic-conflict path** — the incoming diff touches code, a lockfile, config, fixtures, lint / tsconfig / `turbo.json`, CI workflows, exported symbols, or a package your branch also touches. `pnpm-lock.yaml` is the case that genuinely warrants it (4 of those 17); **or**
  - **(b) Too broad to cheaply assess** — the incoming diff spans more files than you can quickly eyeball for disjointness. Don't agonize over a big overlap analysis; just catch up. This is rare, so one extra catch-up is cheap.
```

**Amended 2026-07-26 after final whole-branch review:** the residual-risk
blockquote originally placed right after these bullets was moved below the
`git merge origin/main` command block (it was severing that command from the
bullets it implements) and folded together with the pre-existing "Structural
fix on the roadmap" blockquote further down the Rule 3 section, so there is
one merge-queue note, not two — it still carries every fact from both (the
`strict_required_status_checks_policy: false` detail, the SolidJS-port
anecdote, the spec link, and the `docs/IDEAS.md` pointer).

- [ ] **Step 2: Update the Quick Reference row**

In the same file's Quick Reference table, replace the `Is the branch current?` row with:

```markdown
| Is the branch current? | `git merge-base --is-ancestor origin/main HEAD` (exit 0 = current; if "behind" → triage per Rule 3: **prose-only overlap merges as-is**, catch up only on a real semantic-conflict path or a too-broad diff) |
```

- [ ] **Step 3: Correct the stale claims in IDEAS.md**

In `docs/IDEAS.md`, under `### Adopt a GitHub merge queue`, replace the
`**What it would take / caveats for this repo:**` bullet list with:

```markdown
**Status (2026-07-26): brainstormed, and deliberately deferred.** See the
[design spec](superpowers/specs/2026-07-26-catchup-triage-and-merge-queue-design.md).
Measuring first inverted the case, and two caveats previously recorded here were
found to be **stale**:

- ~~"Requires branch protection with required status checks; today there's no
  review gate"~~ — **already in place.** An active ruleset on `main` (no bypass
  actors) requires a PR, restricts merges to `allowed_merge_methods: ["merge"]`,
  and requires both CI jobs. `required_approving_review_count` is `0`, which
  keeps Rule 4's no-human-gate policy working.
- ~~"local `main` auto-pushes to origin, so direct pushes bypass a queue"~~ —
  **not true in this checkout.** `.git/hooks` holds only Git LFS hooks; that
  behaviour is specific to the sandbox environment. Direct pushes to `main` are
  already impossible.

**What actually deferred it:** a queue charges a CI run on *every* merge, where
**71% of merges pay nothing today** (green branch, disjoint diff, merge as-is).
The tax it would replace measured at only ~2.9 min/PR (17 of 59 merges needed a
catch-up, median CI 10.1 min) — and **53% of that came from one file**,
`docs/STATUS.md`, fixed for free by sharpening Rule 3 instead.

**Still true, and still unanswered:** whether GitHub merge queue is available on
a **user-owned** public repo (the docs emphasise orgs), and that this repo's
fine-grained PAT `403`s on `gh pr checks` / `statusCheckRollup`, which merge
queue leans on.

**Revisit when:** the catch-up rate stays materially above ~15% after the Rule 3
change, or `main` starts reddening from stale merges.
```

- [ ] **Step 4: Add the Phase B follow-up to STATUS.md**

In `docs/STATUS.md`, add to the `## ⚪ Optional / next step (no plan file yet)` section:

```markdown
- **Merge queue — decision deferred on measured data, revisit ~2026-08-09.** The catch-up triage in [`shipping-repo-changes`](../.claude/skills/shipping-repo-changes/SKILL.md) Rule 3 was sharpened instead (prose-only overlap merges as-is), which addressed the 53% of catch-ups caused by `docs/STATUS.md` collisions at zero cost. A queue remains the only thing that closes the stale-merge hole structurally (`strict_required_status_checks_policy` is `false`, so a green-but-stale PR can still merge into an untested `main` — this has bitten once). **Adopt only if** the catch-up rate stays materially above ~15%, or `main` starts reddening from stale merges — re-measure with the command in the [spec](superpowers/specs/2026-07-26-catchup-triage-and-merge-queue-design.md) § Verification. Two unknowns must be settled first: whether merge queue works on a **user-owned** public repo, and the PAT's `403` on the check-rollup APIs the queue relies on. Design: [spec](superpowers/specs/2026-07-26-catchup-triage-and-merge-queue-design.md); background: [IDEAS.md](IDEAS.md).
```

- [ ] **Step 5: Verify the doc links resolve**

Run: `pnpm check:doc-links`
Expected: PASS, with a count one or two higher than before (new relative links added). A failure means a relative path in Step 1, 3 or 4 is wrong — the SKILL.md links are three levels up (`../../../docs/…`), the STATUS.md links are relative to `docs/`.

- [ ] **Step 6: Re-read Rule 3 end-to-end for coherence**

Read the whole Rule 3 section top to bottom. Confirm: the prose bullet sits *between* "merge as-is" and "catch up" so the reading order is disjoint → prose-only → real overlap; the residual-risk note does not contradict Rule 4; nothing still says "shared file ⇒ catch up" unqualified.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/shipping-repo-changes/SKILL.md docs/IDEAS.md docs/STATUS.md
git commit -m "docs(shipping): prose-only overlap no longer forces a catch-up — 53% of them were STATUS.md

Rule 3 said 'shared file => catch up'. Measured over 59 merges: 17 needed a
catch-up, and 9 of those 17 shared only docs/STATUS.md — every one auto-merged
cleanly. They were not conflicts, they were the rule read literally, at ~10 min
of CI each.

Rule 3 now exempts overlaps where every shared path matches **/*.md
(CLAUDE.md counts as prose; .claude/settings.json does not). Code, lockfiles,
config, fixtures and CI still trigger a catch-up — pnpm-lock.yaml is the case
that genuinely warrants it.

Also corrects two stale caveats in IDEAS.md's merge-queue note (the review gate
already exists; main does not auto-push in this checkout) and records the queue
as deferred-on-data with a revisit trigger in STATUS.md.

Residual risk unchanged and now stated in the rule: strict_required_status_checks_policy
is false, so a green-but-stale PR can still merge into an untested main."
```

**Note (added after final review):** the commit actually made for Task 1
(`8465509e`) predates this glob narrowing and its message says `**/*.md or
docs/**`, matching the code as it stood at that moment — that history is not
rewritten. The template above reflects the current rule (`**/*.md` only)
after the fix-round amendment; it is what a *new* commit touching this rule
should say, not a rewrite of the old one.

- [ ] **Step 8: Open the PR and follow Rules 2-6**

Push, open a PR, poll CI with `gh run list` (never `gh pr checks` — it 403s),
merge with `--merge` once green for your SHA, then remove the worktree.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task/Step |
|---|---|
| Prose-only overlap merges as-is, glob `**/*.md` | Task 1, Step 1 |
| `CLAUDE.md` prose / `.claude/settings.json` not | Task 1, Step 1 |
| Code, lockfiles, config, fixtures, CI still catch up | Task 1, Step 1 (bullet a) |
| Carry the measured evidence in the rule | Task 1, Step 1 (both bullets) |
| Record the counter-example (SolidJS red main) | Task 1, Step 1 (residual-risk note) |
| `strict` stays `false`, ruleset untouched | Global Constraints; no step modifies it |
| Phase B conditional, with revisit trigger | Task 1, Steps 3–4 |
| Open feasibility question preserved | Task 1, Steps 3–4 |
| Verification: doc-links + re-measure after ~2 weeks | Task 1, Step 5; re-measure recorded in Step 4's STATUS entry |
| Rollback = revert one file | Achieved: change is 3 docs, no infrastructure |

No gaps.

**Placeholder scan:** No TBD/TODO. Every step contains the literal text to write, not a description of it.

**Type consistency:** N/A (no code). Cross-checked instead that the glob `**/*.md` is stated identically in the spec, Step 1, and Step 3, and that the figures (59 merges, 17 catch-ups, 9 from STATUS.md, 53%, 10.1 min, 71%, ~2.9 min) match the spec exactly in every place they appear.
