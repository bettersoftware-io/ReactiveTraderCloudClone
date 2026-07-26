---
description: Capture what this session worked out into the repo's docs — survey, propose, then ship it as a PR
argument-hint: [topic keywords]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(pnpm:*), Bash(grep:*), Bash(ls:*), Read, Write, Edit
---

Document what this session established, into this repo's `docs/`. Topic keywords: `$ARGUMENTS`.

## Corpus survey

!`ls docs/*.md | sed 's|docs/||'; echo "--- subtrees ---"; ls -d docs/*/ | sed 's|docs/||'; echo "--- total ---"; find docs -name '*.md' | wc -l | xargs echo "md files:"`

## Topic hits

!`if [ -z "$ARGUMENTS" ]; then echo "(no keywords supplied — survey the listing above by hand)"; else printf '%s' "$ARGUMENTS" | tr ' ' '\n' | grep -v '^$' | while read -r kw; do echo "--- $kw ---"; hits=$(grep -rl -i -F --include='*.md' -e "$kw" docs 2>/dev/null | head -6); if [ -n "$hits" ]; then printf '%s\n' "$hits" | sed 's/^/  /'; else echo "  (none)"; fi; done; fi; true`

## Where things belong

Route before you write. Putting a finding in the wrong document is worse than
not writing it, because the right document then looks complete.

| Finding | Home |
|---|---|
| Pending work, or closing something that was pending | **`docs/STATUS.md`** — owned by the `tracking-workstream-status` skill. **Invoke that skill; do not hand-edit.** |
| Speculative, not yet earned a spec | `docs/IDEAS.md` (the icebox) |
| A decision with alternatives and consequences | a new `docs/adr/ADR-NNN-<slug>.md` |
| Structure, layering, package graph | the numbered section under `docs/architecture/` |
| A tool/subsystem's behaviour and traps | its own top-level `docs/<topic>.md` |
| A rule every session must follow | `CLAUDE.md` — but only if it truly is every session; it loads into **every** context, so the bar is high |

## Procedure

### 1. Read the closest related doc in full

Not a skim. It is both the **dedup check** (does this already live here?) and the
**style exemplar** — this corpus has a house voice and section rhythm; mirror the
neighbour rather than inventing a layout.

### 2. Propose placement, then stop

```
Related docs:  <file> (covers …)
Proposal:      UPDATE <file> — <what changes>
               CREATE <file> — <what it covers>  + map entry + cross-links
Exemplar:      <file>
Proceed?
```

Wait for approval. If the finding spans several docs, list them all and let the
user trim.

### 3. Isolate, then write

```bash
./scripts/new-worktree.sh <name>
```

**Before touching any file** — concurrent sessions share this checkout, and
`main` takes changes only through a PR (`shipping-repo-changes`, Rule 1).

Then write. Organize by topic, never by conversation order. Distinguish what was
**verified** from what was asserted — this corpus is trusted precisely because it
is accurate, and one confidently-wrong line poisons it.

A new top-level doc must also be added to **`docs/README.md`** (the Documentation
Map) and cross-linked from its nearest relative in both directions. A doc nobody
can find is not documentation.

Mermaid: compose **tall, not wide** — GitHub scales every diagram to column
width. ≤4–5 boxes per rank; edge-less subgraphs tile side-by-side, so force
vertical stacking with invisible links. See CLAUDE.md → "Markdown Diagrams".

### 4. Gate, ship, merge

```bash
pnpm check:doc-links     # relative links AND heading anchors — CI gates this
pnpm exec biome ci .
```

Anchor slugs are unforgiving (` -- ` slugs to four dashes); the checker is the
oracle, not your intuition. Then commit, push, open a PR, poll CI on your
`headSha` with `gh run list` (**not `gh pr checks`** — it can't be matched to a
`headSha`, so it may report a stale run, and it 403s under the sandbox's PAT),
merge with `--merge` once green, confirm the commit is on `origin/main`, and
remove the worktree.

## When not to write

- The finding is already in the repo — an edit beats a new file, and a
  fragmenting corpus is the main failure mode at 298 files.
- It is pending work → that is `STATUS.md` via its skill, not a new doc.
- It is true only of this conversation. Docs are read months later by someone
  with no context; if it does not survive that, skip it.
