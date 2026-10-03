# `@rtc/client-react-native` coverage — two runners, one merged number

`pnpm --filter @rtc/client-react-native test:coverage` runs both test runners
with coverage and then prints the **merged line coverage**, which is the
figure to quote. `test:coverage:gate` is the same run failing below **95%**;
it is a step in `ci.yml`.

Measured 2026-10-03: **96.89% of lines** (5,173 of 5,339, 188 source files).

## Why there are two runners

This is the only package in the repo running two test runners, split by file
extension:

| script | runner | owns | why |
|---|---|---|---|
| `test:unit:coverage` | vitest (v8) | `*.test.ts` | adapters, hooks, pure logic, scene math — no react-native runtime needed, so it runs in seconds |
| `test:native:coverage` | jest (`jest-expo`, istanbul) | `*.test.tsx` | component suites that need the react-native runtime `jest-expo` bootstraps |

Reports land in `reports/unit/coverage/`, `reports/native/coverage/` and
`reports/merged/coverage/summary.json` (all gitignored).

## Why the merge is by line

Each runner reports the whole package while running half the tests, so neither
runner's own percentage is the package's:

| measure (2026-10-03) | statements | branches | functions | lines |
|---|---|---|---|---|
| jest alone | 94.20% | 81.25% | 91.24% | 94.06% |
| vitest alone | 26.65% | 28.97% | 35.46% | 26.55% |
| **merged** | — | — | — | **96.89%** |

The two rows above the merge cannot be added. The providers do not agree on
how many statements, branches or functions a file has (5,467 istanbul
statements against 5,751 v8 for the same tree), so a union of those would be
invented. **Lines** are the one unit both report against the same source text.
`tests/coverage/mergeLcov.ts` therefore takes jest's instrumented lines as the
denominator and counts a line covered when either runner hit it.

That is why the gate is on lines only. Branches at 81% (jest alone) is the
weakest axis and has no merged figure; it is not gated.

## The 63.9% that was never real

Until 2026-10-03 this file, and `docs/STATUS.md`, quoted jest at **63.89%**
statements and concluded the package sat far below the web clients' bar. That
number was wrong, and the cause was the denominator, not the tests.

`collectCoverageFrom` was `src/**/*.{ts,tsx}`. jest leaves out the test files
it runs, but the 59 `*.test.ts` files are vitest's — jest never runs them, so
it counted every one as uncovered **source**: 2,549 lines, a third of the
denominator, all at 0%. Both configs now exclude `*.test.{ts,tsx}` and
`__tests__/`, and the same jest run reads 94%.

The lesson is the one `CLAUDE.md` records for every coverage figure here: look
at **which files** sit at 0% before believing an aggregate. The 59 files at 0%
were all named `*.test.ts`.

## What the gate cannot see

The gate is an aggregate, and an aggregate cannot surface one weak file. The
report always prints the files with the most uncovered lines; on 2026-10-03
the weakest by percentage were `useShellTelemetry.ts` (50.0%),
`AppearanceOverlay.tsx` (66.7%) and `SellSideTicket.tsx` (73.3%).

## Not done

- **No tier in `coverage-report.yml`.** The published report has ten tiers and
  none is RN.
- **No UI contract tier.** RN owns none of the shared `@rtc/ui-contract`
  behavioural specs and cannot simply adopt them: the shared page objects query
  the DOM, and RN implements a different design (mobile v1) over the same core,
  so many web specs assert screens RN deliberately does not have. Tracked in
  `docs/STATUS.md`.

## The near-miss that hid the original gap

Before 2026-08-14 this package had no coverage measurement at all, and three
mechanisms each looked like they covered it. The worst was a **name**:
`check:react-coverage` (CI step *"React package coverage"*) listed
`client-react-native` in its policy map and went green — so an auditor asking
"do all React packages have coverage?" got a tick for the wrong question. It
checks three React *lint* policies, and was renamed **`check:react-policies`**
for that reason. See `docs/handler-naming.md`.
