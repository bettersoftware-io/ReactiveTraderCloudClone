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

## Tooling & workflow

### Adopt a GitHub merge queue

Replace the manual "assess catch-up risk" triage in the
[`shipping-repo-changes`](../.claude/skills/shipping-repo-changes/SKILL.md) skill
(Rule 3) with GitHub's **merge queue** — the equivalent of GitLab's merge trains.

**Why:** concurrent Claude sessions + auto-pushing `main` mean a branch that's
green can go stale before it merges. Today we handle that by hand (triage the
incoming diff; catch up only on overlap). A merge queue does it structurally:
when you'd merge, GitHub instead builds a temporary branch of `main` + everything
ahead of you in the queue + your PR, runs the required checks against *that*
combined state, and merges in order only if green. The cat-and-mouse loop
disappears — it's pipelined, not retried.

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
