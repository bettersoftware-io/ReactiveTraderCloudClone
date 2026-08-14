---
description: Run the local mirror of CI's `checks` job — fast tier by default, `full` for all of it
argument-hint: [full]
allowed-tools: Bash(pnpm:*), Bash(git:*), Read
---

Run the local gate gauntlet. Argument: `$ARGUMENTS` (empty → fast tier, `full` → everything).

## CI's current `checks` step list — compare against the tiers below

!`awk '/^  checks:/,/^  e2e:/' .github/workflows/ci.yml | grep -E "^\s+- name:" | sed 's/.*- name: //' | grep -viE "corepack|store path|cache the|install dependencies|checkout|setup-node"`

**Before running anything**, account for every step in that list. Walk it top to
bottom and name, for each step, the tier command that covers it — or `UNMAPPED`,
or the explicit skip reason. Do not eyeball the two lists side by side and
declare them equivalent: `check:prototype-shots` was a CI gate absent from both
tiers for an unknown stretch, and each free-form comparison read as "looks
right". Emit the mapping as a compact list, then run every `UNMAPPED` step
anyway and report it loudly — a gauntlet that has silently stopped mirroring CI
is worse than no gauntlet. This repo already runs four drift checks; this is the
same idea applied to itself.

Only two steps may be skipped locally, and only for the reasons given here:
**Expo bundle smoke** (Metro monorepo resolution — belongs on a clean runner)
and, in the fast tier, everything listed under **Full tier**. Anything else
unmapped is drift, not a judgement call.

The list is scoped to the **`checks` job only**. An earlier version grepped the
whole workflow and so flagged the three `e2e`-job steps (`Install Playwright
Chromium…`, `e2e suite…`, `Upload e2e artifacts…`) as unknown gates on *every*
run. A drift check that always fires is one you learn to ignore — which is
exactly the failure it exists to prevent.

## Fast tier — default, ~50s, no build required

> **Adding or removing a gate below?** `CLAUDE.md`'s `/rtc:gauntlet` row states
> the fast-gate count in prose and nothing verifies it — it has already gone
> stale twice (14 → 15 → 18 → 19). Update it in the same commit.

Run in this order and stop reporting nothing until all have run (run them all
even if one fails — a single command's failure is not a reason to skip the rest):

```bash
pnpm exec biome ci .                    # format + import-sort + lint
pnpm lint:eslint                        # AST rules
pnpm test:rules                         # custom rule RuleTester suite
pnpm lint:css                           # stylelint
pnpm lint:actions                       # actionlint
pnpm check:doc-links                    # md links + anchors
pnpm check:manifest-drift               # presenter manifest, web ↔ RN
pnpm check:prototype-shots              # prototype deviation corpus, manifest ↔ tree
pnpm check:image-tag-drift              # Playwright image pin
pnpm check:versions                     # manypkg + syncpack
pnpm check:scripts                      # every package wired to the gates
pnpm check:react-policies               # compiler / memo-ban / react-hooks policy per React pkg
pnpm check:compiler                     # React Compiler coverage (de-memoized files)
pnpm check:worklet-order                # worklet capture safety (RN + motion-core)
pnpm --filter @rtc/tests test:pages     # pages tooling units
pnpm --filter @rtc/tests test:hooks     # cucumber hooks units
pnpm lint:dead                          # knip
pnpm check:deps                         # dep-cruiser cycles + layering
pnpm --filter @rtc/tests gates          # grep gates + pnpm audit --prod
```

**`pnpm exec biome ci .` is not the same as `pnpm lint`.** The local `lint`
script is lint-only; CI runs `biome ci`, which additionally enforces formatting
and import ordering. Biome-clean locally has passed while CI went red on exactly
this difference — always run the `ci` form here.

## Full tier — `full` only, ~8 min plus a cold build

Everything above, then:

```bash
pnpm typecheck
pnpm test                                                   # unit, the long pole (~2.5 min)
pnpm check:lint-warnings-drift                              # re-runs ESLint; slower than it looks
pnpm lint:eslint:types                                      # type-aware rules
pnpm --filter @rtc/client-react test:ui:contract:coverage   # ≥95%
pnpm --filter @rtc/client-solid test:ui:contract:coverage   # ≥95%, branches ≥85%
pnpm build
pnpm check:devtools-dist                                    # REQUIRES the build above
```

`check:devtools-dist` asserts `packages/client-react/dist/devtools/index.html`
exists, so it can only run after `pnpm build` — never hoist it into the fast tier.

**Not included, deliberately:** `e2e` is a separate CI job, not part of `checks`,
and adds many minutes. Run `pnpm test:e2e` explicitly when you want it. The
**Expo bundle smoke** step is also skipped locally — it is a Metro
monorepo-resolution check that belongs on a clean CI runner.

## Sibling-worktree false reds

This repo keeps live worktrees under `.claude/worktrees/`. Lint tasks run from
the **primary checkout** glob into them, so a failure can be reported for a file
that belongs to another session's branch, not yours.

Before reporting any lint failure, check whether its path contains
`/.claude/worktrees/`. If it does, it is **not your failure** — say so explicitly
rather than trying to fix it, and never edit a file under another worktree.

## Reporting

One line per gate: name, pass/fail, and the wall time if notable. Then:

- If everything passed, say so in one line. Do not pad it.
- If anything failed, lead with the failures, quote the actionable part of the
  output (not the whole log), and state clearly whether each is genuinely yours
  or a sibling-worktree artefact.
- If you ran the fast tier, close by naming what `full` would additionally cover,
  so a green fast run is never mistaken for a green CI.
