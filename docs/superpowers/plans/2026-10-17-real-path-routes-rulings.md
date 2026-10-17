# Real path routes — controller rulings

Companion to [the plan](2026-10-17-real-path-routes.md) and [the spec](../specs/2026-10-17-real-path-routes-design.md). The controller wrote this during subagent-driven execution on 2026-10-17. It records every decision taken on the plan's behalf, the review fixes, and the deferred findings with their triage. Each ruling reads: decision, why, and the cost if wrong.

## Pre-flight scan

The scan found no conflicts between tasks. One structural fact is worth recording: Task 1 changes the grammar, which turns the web-boot and ui-contract suites red until Tasks 2 and 3 land. The plan's execution note says so, and each task ran only its own package's suite until Task 3 brought the tree back to green.

## Review fixes

- **Task 3, fix round 1.** A hash-to-path respelling made one assertion vacuous.
  - Where: `AuthGate.routes.contract.spec.ts`'s "leaked login hook" filter.
  - Why: the filter split a history write on `"#"`. The writes now read `push /x`, so the split found nothing, the filter always returned `[]`, and `toEqual([])` could not fail.
  - The fix: the filter now reads the route after the verb.
  - The proof: a mutant that makes the workspace controller write an account route on the Back-to-login path is KILLED on both clients, at this assertion alone.
  - Why the plan missed it: its leftover grep searched for the word "hash", not for the `"#"` delimiter. Task 4's brief added the delimiter grep for `tests/`, which found nothing.

## Rulings

- **Ruling 1: the final-review minors are fixed in one wave, after the full gauntlet finished.**
  - The minors:
    - the two fake histories' `traverse` docs now say "Back/Forward landing on `path`", matching the port;
    - "no route" test seeds are `"/"`, not `""`;
    - authentication.md §7.9 says old `#/…` links are not redirected (they land on the default route, and the fragment stays in the address bar) and names `vercel.react.json` / `vercel.solid.json`;
    - `openWorkspaceAt` moved next to `openWorkspace`.
  - Why: the user asked on 2026-10-17 that cosmetic minors be fixed rather than deferred. Waiting for the gauntlet meant no file changed under a running gate.
  - Cost if wrong: a few lines of churn.
- **Ruling 2: the impossible negative vectors stay in `appRoutes.test.ts`, and no `/fx#x` vector is added.** The impossible vectors are `/fx?x=1` and `#/fx`.
  - Why: they assert exactness at no cost. The adapter test already pins the fragment boundary ("current reads location.pathname, ignoring the fragment").
  - Cost if wrong: none.
- **Ruling 3: no `curl …/credit` step was added to `deploy.yml` in this change.**
  - Why: spec §4 lists `deploy.yml` as untouched, and that list is the demonstration.
  - What it costs: the Vercel rewrite stays a manual post-deploy check (spec §6). It is offered as a follow-up.
  - Cost if wrong: one more manual check per deploy.
- **Ruling 4: the `RolldownError PARSE_ERROR` lines printed by the React contract coverage run are left alone.**
  - Why: the Task 3 implementer saw them on the base commit before any edit, and the gate passes with them.
  - Cost if wrong: an unrelated warning stays noisy until someone tracks it.

## Deferred findings: final triage

| Finding | Outcome |
|---|---|
| T1: no `/fx#x` negative vector | Left (Ruling 2) |
| T3: React contract coverage prints `RolldownError PARSE_ERROR` | Pre-existing (Ruling 4) |
| T4: stale `packages/web-boot/dist/adapters/HashRouteHistory.*` | Local build leftovers, gitignored. Deleted before the final gauntlet. |
| T4: `openWorkspaceAt` placement | Fixed (Ruling 1) |
| T5: §7.9 doesn't mention old `#/` links | Fixed (Ruling 1) |
| T5: §7.9 doesn't name the Vercel files | Fixed (Ruling 1) |
| Final M1: fake `traverse` docs disagree with the port | Fixed (Ruling 1) |
| Final M2: a stale `#/x` fragment rides along after an old link | Documented (Ruling 1). It is in-spec under D2 and §3.2. |
| Final M3: `""` seeds where a pathname is never empty | Fixed (Ruling 1) |
| Final M4: impossible negative vectors | Left (Ruling 2) |

## Verification on the final tree

- **Full gauntlet:** 35 gates, aligned with CI's `checks` job, all PASS. The aligned list includes the React Native coverage gate and leaves out the lint-warnings drift check that CI has disabled.
- **After the fix wave:** Biome, ESLint, doc-links, typecheck and knip were re-run, all PASS.
- **`pnpm test:e2e`:** 10/10 suites PASS, including the browser and hybrid fullstack smokes on both clients.
- **Browser check on `vite dev`, against a local server, on both clients:**
  - a cold `/create-account`
  - login-mode Back/Forward
  - sign-in landing on `/fx`
  - tab Back/Forward
  - Back onto a login entry while signed in, which is rewritten to the tab
  - a cold load and reload of `/credit?core=effect`, which stays on Credit on the effect core
  - `/devtools/` serving the inspector

  The Preferences core swap on `/credit` is covered by `coreSwitch.spec.ts` on both clients.
