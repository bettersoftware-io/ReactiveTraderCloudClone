# `@rtc/client-react-native` coverage — two tiers, and why neither is "the number"

Until 2026-08-14 this package had **no coverage measurement of any kind**. Not
"low coverage" — *unmeasured*, so no figure existed for anyone to be alarmed by.
`pnpm --filter @rtc/client-react-native test:coverage` now produces one, and this
file exists so the first person to quote it does not quote it wrongly.

## Why there are two tiers rather than one

This is the only package in the repo running **two test runners**, split by file
extension:

| tier | runner | owns | why |
|---|---|---|---|
| `test:unit:coverage` | vitest (v8) | `*.test.ts` | adapters, hooks, pure logic, scene math — no react-native runtime needed, so it runs in seconds |
| `test:native:coverage` | jest (`jest-expo`, babel/istanbul) | `*.test.tsx` | component suites that need the react-native runtime `jest-expo` bootstraps |

`test:coverage` runs both. Reports land in `reports/unit/coverage/` and
`reports/native/coverage/` respectively (gitignored, per the repo-wide
`reports/<tier>/coverage/` convention).

## The trap: the two numbers are NOT addable

First measurement, 2026-08-14, both tiers against the **whole** package
(`src/**/*.{ts,tsx}`):

| tier | statements | branches | functions | lines |
|---|---|---|---|---|
| jest (109 suites, 507 tests) | **63.89%** (4940/7731) | 76.38% | 53.69% | 63.61% |
| vitest (58 files, 540 tests) | **26.48%** (1483/5599) | 28.44% | 34.37% | 26.38% |

Read those two rows carefully before doing arithmetic on them:

1. **The denominators differ** — 7731 statements vs 5599, for the same source
   tree. Istanbul (babel) and v8 instrument differently and simply do not agree
   on what a statement is. This is the same hazard `CLAUDE.md` already flags for
   the react-vs-solid `ui (visual reach)` tiers: *don't compare percentages
   across instrumentation, compare which files sit at 0%.*
2. **Each tier's denominator is the whole package, but each only runs half the
   tests.** That is deliberate — the number answers "how much of this package
   does vitest alone reach", which is a real question, and refuses to flatter
   itself by shrinking the denominator to the half it happens to test. It is not
   a claim about the package.
3. **So neither figure is "RN's coverage", and the sum is not either.** The true
   figure is the *union* of lines covered by both runners, which needs a merged
   report. That merge is deliberately not built yet.

## What is deliberately NOT done here

Per the ordering recorded in `docs/STATUS.md` — **measure first, gate second**:

- **No CI gate.** The web clients are held to ≥95% statements / ≥85% branches.
  Both tiers here are far below that, and picking a bar before knowing the
  merged number would be picking it blind.
- **No merged report.** Needs either a common provider across both runners or an
  lcov merge step; both are real design calls, not plumbing.
- **No 9th tier in `coverage-report.yml`.** Follows the merge decision.
- **No UI contract tier.** RN owns 0 of the 99 shared `@rtc/ui-contract`
  behavioural specs, and cannot simply adopt them: `MountedRoot.root` /
  `PageContext.root` are typed `HTMLElement` and **86 of 92** shared page objects
  query the DOM. The *specs* are nearly clean (only 5 of 99 touch the DOM), so
  the portable half is the specs and the unportable half is the page-object layer
  beneath them. Note also that RN implements a *different design* (mobile v1)
  over the same core, so a large fraction of the web specs assert screens RN
  deliberately does not have.

## The near-miss that hid this

Three mechanisms each looked like they covered this package and none did. The
worst was a **name**: `check:react-coverage` (CI step *"React package coverage"*)
listed `client-react-native` in its policy map and went green — so an auditor
asking "do all React packages have coverage?" got a tick for the wrong question.
It never checked test coverage at all; it checks three React *lint* policies.
It was renamed to **`check:react-policies`** on 2026-08-14 for exactly that
reason. See `docs/handler-naming.md` — a name must state its effect, and that
applies to gates as much as to functions.
