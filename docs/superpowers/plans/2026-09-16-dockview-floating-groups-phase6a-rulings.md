# Dockview Floating Groups (Phase 6a) — Execution Rulings

**Plan:** [2026-09-16-dockview-floating-groups-phase6a.md](2026-09-16-dockview-floating-groups-phase6a.md) · **Spec:** [../specs/2026-09-15-dockview-floats-and-presets-design.md](../specs/2026-09-15-dockview-floats-and-presets-design.md) §3 · **Shipped:** PR #763 (merged 2026-09-19)

The plan was written before implementation. During execution, 39 decisions were
taken on the user's behalf — where the plan was wrong, silent, or contradicted by
measurement. Each is recorded as **what was decided — why — what it costs if
wrong**, so a later reader can tell a deliberate choice from an accident and knows
what to revisit if one turns out wrong. This file is the durable copy: the working
ledger they came from lived in git-ignored scratch space and did not survive the
branch.

Rulings are in the order they were made. References to "Task N" are the plan's
tasks; "#745", "#751" are other PRs that landed on `main` during execution;
"the peer" is a concurrent Claude session working in the same engine file.

## Measured facts the rulings rest on

Task 1 characterized `dockview-core@8.3.1`'s floating primitive with committed
tests before any code was written. Two of the plan's assumptions were wrong:

- Q1: `addFloatingGroup(group)` detaches a grid group IN PLACE (internally `doRemoveGroup(..., { skipDispose: true })`). No prior removal needed.
- Q2: **the plan's sketch was WRONG.** `.dv-split-view-container` is NOT grid-exclusive — a float gets its own nested gridview wrapper carrying the same class, so `closest(".dv-split-view-container")` is non-null. The real boundary: the float leaves the SEED grid's pre-existing split subtree and lands in a sibling `dv-floating-overlay-host`, still inside the engine container.
- Q3: `toJSON()` emits `floatingGroups`; a fresh engine's `fromJSON()` restores `location.type === "floating"`. The design's "floats persist" is therefore free, as assumed.
- Q4: `api.moveGroupOrPanel` / `api.moveGroup` are NOT on the public `DockviewApi` (internal component only). The working public mechanism is `panel.api.moveTo({ group, position })`, which docks a float back to the grid.
- Q5: `api.groups` still CONTAINS a floating group (the registry is not pruned on float); only the spatial grid loses it. `groupCount()` is unchanged by floating.

Later measurement added: dockview's `onDidLayoutChange` is microtask-buffered
while `onDidMutateLayout` fires synchronously as the outermost mutation closes;
its AsapEvent drops fires queued before a listener subscribes (so work done during
construction is invisible to a later subscriber); and it silently discards
`setConstraints` on a group with no grid view — which is why no jsdom test can
witness a real size.

## Rulings

- **Ruling 1 (Task 1, characterization tests):** an assertion may be changed ONLY to state the behaviour actually observed, and the observed value must be asserted explicitly (`expect(x).toBe(<observed>)`), never deleted, loosened to `toBeDefined()`, or replaced with a truthiness check. A characterization test that cannot fail is worthless. Cost if wrong: Tasks 2-4 build on a fact nobody actually pinned, and the first real bug surfaces in the real-app pass instead of in jsdom.

- **Ruling 2 (Task 4, restore tier):** the named tier MUST be asserted by a test that fails if the tier is wrong. If `loadBlobOrSeed` is not reachable from the test, widen the module's test surface (export the tier type and a small pure helper) rather than settle for an observable-layout-only assertion — the design's §3.3 requires the degraded restore to be distinguishable, and a test that passes whether or not the tier is named defeats it. Cost if wrong: the engine can silently restore less than it loaded, which is the exact failure class this repo keeps re-learning.

- **Ruling 3 (ordering):** Tasks are executed in plan order 1→11 with no batching. Tasks 6 and 7 are same-shape across two clients and would normally batch, but they are different frameworks with different reactivity rules (React Compiler vs Solid memo) and each deserves its own review surface. Cost if wrong: one extra review seat.

- **Ruling 4 (Task 2, dock-back mechanism):** `dockPanel` uses `panel.api.moveTo({ group, position })` against the seed-home anchor, NOT the plan's remove-and-reopen fallback. Task 1 proved the public API exists and works; the fallback was written for the case where it did not. Cost if wrong: dock-home lands the panel at a different slot than the seed declares, visible in the real-app pass.

- **Ruling 5 (Tasks 3 and 4, how "is this floating?" is decided):** every engine check uses `group.api.location.type`, never a DOM-class test. Q2 proved the class is ambiguous. Corollary, load-bearing for Task 3: because `api.groups` includes floats (Q5), any walk that iterates `api.groups` — the maximize strip walk, the instance-share member count — needs an EXPLICIT `location.type === "grid"` filter; the plan's "floats are probably naturally excluded" assumption holds only for walks that descend from a grid split element, not for `api.groups` iteration. Task 3 must test both shapes. Cost if wrong: a float silently counted as a grid member, mis-sizing the share or the strip.

- **Ruling 6 (Task 3, pin suspension must not share the peer's list):** floating's pin suspension gets its OWN record list, which `settlePinAbsorption()` skips. Sharing `unabsorbedPins` would let an absorber appearing elsewhere re-clamp a floated panel's pin and snap the float back to its design width. Cost if wrong: a float silently resizes itself when an unrelated panel is closed or expanded — the kind of bug only the real-app pass catches.

- **Ruling 7 (catch-up ordering):** Task 2 finishes on the current base; then, before Task 3 is dispatched, `origin/main` is merged into this branch IF #745 has landed. Task 3 edits the pin machinery #745 rewrote, so going in blind would produce a semantic conflict no gate catches (Rule 3's "overlap with a real semantic-conflict path"). Cost if wrong: one extra CI loop, or a wasted Task 3 if the merge changes the ground under it.

- **Ruling 8 (reorder):** #745 is green and MERGEABLE but not merged, and merging another session's PR is not mine to do. Rather than idle, Task 5 (floating chrome in dockview-hud.css) runs now — it touches only the stylesheet and its text-level guard test, sharing no file with #745 or with Task 3. Task 3 stays behind the #745 catch-up per Ruling 7. Cost if wrong: none material; Task 5's selectors are independent of the pin machinery, and Task 10's goldens run after both regardless.

- **Ruling 9 (Task 3, test witness for pin suspension):** assert the CLAMP state (the group's min/max constraint), never a measured width, when proving float-time pin suspension. jsdom lays nothing out and a floated group's pixels are not vacated in a stub world, so a width assertion would be the "absence reported as a clean reading" failure class again. Cost if wrong: a vacuous test that passes whether or not suspension happens — exactly the #738 R21 defect.

- **Ruling 10 (Task 3, floatPanel calls settlePinAbsorption):** `floatPanel` and `dockPanel` call the peer's `settlePinAbsorption()` as additional callers (no arguments, idempotent). A float removes an absorber, so it can legitimately starve the grid the same way a close did, and it can legitimately suspend pins on panels I did not touch — that is correct behaviour and needs its own test, not a guard against it. Cost if wrong: floating a panel leaves the grid clamped to a pinned extent with dead space, the exact (b) symptom the peer just fixed.

- **Ruling 11 (Task 3, reuse not reinvent):** after the #745 catch-up, Task 3 uses the peer's `isInGrid` for every grid-membership test, and folds Task 2's own inline `location.type === "grid"` checks onto it in the same diff, with a one-line note in the commit message. Two spellings of the same predicate in one file is how the pop-out absorber bug survived since Phase 5. Cost if wrong: a trivial revert; the helper is behaviour-identical to the inline checks.

- **Ruling 12 (this phase's test-tier split):** no jsdom test in Phase 6a asserts geometry. The peer's corollary is decisive — a stub cannot vacate a floated group's pixels, so no sibling can grow into freed space and any "other panels grew" assertion would pass or fail for reasons unrelated to the code. jsdom asserts constraint state and bookkeeping only; every geometry claim (the float actually leaves the row, the siblings actually take the space) belongs to Task 9's real-browser e2e and to the controller's real-app pass. Cost if wrong: a geometry regression that only the golden/e2e tier can see — which is where this ruling puts the burden anyway.

- **Ruling 13 (double header):** Task 3 adds `floatingGroupDragHandle: "tabbar"` to the `createDockview({...})` options literal (it already edits that file) and MEASURES whether dockview then stops rendering `.dv-floating-titlebar`. If the rail disappears, Task 5's rules for it become dead CSS and Task 3 removes them in the same diff; if it remains, the rules stay and the double header is reported to the user at acceptance as a known cosmetic deviation. Do not guess which — the option's effect on the rail is exactly the kind of thing this phase has already been wrong about twice. Cost if wrong: a float wears two stacked headers in the real app, which the user will see immediately.

- **Ruling 14 (my dispatch gap, found by the catch-up):** `pnpm lint:eslint` is now part of every implementer's required commands. Tasks 1, 2 and 5 were told to run `pnpm exec biome ci .` (the plan's stated gate) but ESLint is a SEPARATE CI gate in this repo, and it reports 4 errors in my own committed files: `createDockEngine.test.ts:4011` (padding-line-between-statements) and `:4035` (inline object type in a cast), `createDockEngine.ts:2365` and `:2367` (padding-line-between-statements). The merge did not cause these — it only changed the `name-functions-by-effect` rule — so they were latent from Tasks 1-2. Task 3 edits both files and fixes all four as part of its diff. Cost if wrong: a red CI on first push, caught before any review.

- **Ruling 15 (handler name):** the bridge handler is `floatOrDockPanel`, as the task brief's own code specifies — NOT `floatPanel` as the plan's Global Constraints line says in passing. One function both floats and docks, so `floatOrDockPanel` states its effect accurately and the Global Constraints line is the imprecise one. Task 7 matches this spelling for parity; Task 11 corrects the plan-derived wording if it repeats the error. Cost if wrong: a rename across two clients and a contract spec.

- **Ruling 16 (parallel disjoint implementers):** Task 7 (client-solid only) runs concurrently with Task 3 (layout-dockview only). The skill's no-parallel rule guards against conflicts, and these two share no file. The real risk is a commit race on one branch, so each implementer is instructed to stage ONLY its own paths and never `git add -A`. Cost if wrong: a commit containing another task's partial work, visible immediately in the review package and fixable by a follow-up commit.

- **Ruling 17 (Task 9 held until Task 3 lands):** the e2e task compiles the whole client, `@rtc/layout-dockview` included, so running it while Task 3 is mid-edit in `createDockEngine.ts` would produce build or behaviour failures that belong to neither task. Task 9 waits, even though its own files (tests/browser/**) do not overlap. Cost if wrong: idle wall-clock while Task 3 finishes — cheaper than debugging a phantom e2e failure.

- **Ruling 18 (R4's mechanism changed, plan deviation):** the plan mandated an `onWillDragGroup` subscription to veto a shift-drag float during a maximize. Measured in the 8.3.1 bundle, that cannot work: the float fires from a `pointerdown` that bails on `defaultPrevented`, while `onWillDragGroup` fires from an HTML5 `dragstart` which the gesture's own `preventDefault` prevents. Accepted as implemented — a capture-phase pointerdown veto on our own container, with a control test proving the gesture is live in jsdom. Cost if wrong: the veto sits on our container rather than dockview's event, so a future dockview change to the gesture's entry point would silently stop vetoing; the control test is what would catch it.

- **Ruling 19 (Ruling 13 resolved — the double header SHIPS):** `floatingGroupDragHandle: "tabbar"` does remove `.dv-floating-titlebar`, but measured: it makes the tab-bar void the only drag surface, and dockview's own stylesheet gives that void `flex-grow: 0` under our `singleTabMode: "fullwidth"` — so a single-panel float (all `floatPanel` produces) would have NO draggable surface. Trade declined: the 22px rail and Task 5's CSS stay, and the 60px stacked header ships as a known cosmetic deviation for the user to accept or reject at the real-app pass. Both halves pinned by tests. Cost if wrong: the user dislikes the double header and we revisit with a custom drag surface — a UI change, not an engine one.

- **Ruling 20 (a vacuous test was replaced, correctly):** the brief's R6 trigger ("open another instance") passed with the filter REMOVED, because floats are excluded structurally on that path. A settled container resize is the only trigger that bites, and that is what the test now uses. This is the #738 R21 defect class caught in the act; the implementer reported it rather than banking a green. Cost if wrong *(added when this record was written, 2026-09-19 — the ledger omitted it)*: none material; the replacement is the stricter test, and the path the old trigger exercised is covered by the structural exclusion it proved.

- **Ruling 21 (Task 2's fallback rewritten):** `dockPanel`'s no-seed-home branch was wrong for a chart instance, which has no seed slot — it tabbed the instance into FX Rates' stack, permanently outside the share rule. Now docks at the root's right edge, matching `insertDynamicPanel`. Cost if wrong: a docked-home chart instance lands somewhere the user did not expect; visible in the real-app pass.

- **Ruling 22 (the collapsed-panel gap is NOT parked — fix round 1):** floating a user-collapsed panel currently yields an unresizable ~39px box. The implementer left it as an eighth rule needing its own design question. I disagree on cost: the veto machinery for R4 now exists, so refusing the collapsed case is a condition on an existing mechanism rather than new machinery, and shipping a control that produces a useless box is worse than shipping without that combination. Fix round 1 dispatched to the same implementer. Cost if wrong: one extra round (~20 min); if the gesture half proves genuinely hard, the button half alone still removes the user-reachable path and the rest parks with evidence.

- **Ruling 23 (the flake is diagnosed now, fixed in its OWN PR):** a diagnosis agent is on it (four failing artifacts plus the passing one, reading the PNGs). It ships as a separate PR, not inside the 6a branch, so the peer's default-flip sequencing gets a green it can trust rather than one entangled with a feature. Cost if wrong: 6a merges onto a still-red gate, which is where main already is, so no regression — but the flip stays blocked longer.

- **Ruling 24 (no tolerance loosening):** the fix may not be a looser `maxDiffPixelRatio` and may not be a golden re-pin. This budget has been wrong in both directions at once before, and a looser ratio would hide the exact class of regression the flip needs this gate to catch. If the diff is real and sub-pixel, the fix is making the scenario deterministic. Cost if wrong: more work than a one-line threshold change, which is the point.
  CORRECTION to my own error note above: `gh run watch --exit-status` is NOT at fault. My background task's captured output file read, in full: `visual exit=1` / `failure` / `[exited with code 0]`. The watch exited 1 correctly; my wrapper was a compound command whose final echo succeeded, so the TASK exited 0, and I read the notification's exit code instead of opening the file that said `failure` on line 2. Re-tested: the watch exits 1 here, gh 2.97.0. The failure class is the repo's existing "wrapper laundered a failure" entry, with the aggravation that the correct evidence was captured and ignored.
  Structural finding worth more than either mistake (peer's, credited): on run 35023095365 the JOB list reads "visual diffs (solid): success" while the gate step's SOLID_OUTCOME is `failure`, because the diff step is `continue-on-error` and only its outcome is captured. Three surfaces disagree about one run — job conclusion, wrapper exit code, run conclusion — and two say green. A reader checking job conclusions is misled by visual.yml's own shape. Belongs in Task 11's docs as a workflow finding, not as a discipline lesson.

- **Ruling 25 (fix the CAPTURE, not the product):** the harness waits for the resize flash to clear before screenshotting, so every skin captures the settled frame. A product CSS rule suppressing dockview's scrollbar flash was REJECTED as the primary fix: the flash is real in-product behaviour after a panel resize, and hiding it repo-wide is a UX decision my user has not made, taken for a test's convenience. Tolerance held; no golden re-pinned before the transient is removed (the #710/#716 lesson — seeding a frame instead of pinning the right one locked in a wrong picture once already). Cost if wrong: ~0.5s per dockview scenario of capture time, and if a settled wait proves unexpressible the implementer reports back rather than choosing a fallback itself.

- **Ruling 26 (sequencing):** the flake fix lands FIRST, off main, as its own PR; 6a then catches up and regenerates goldens ONCE, covering both the settled-capture change and the new float head control. Regenerating twice would collide in the PNG trees. Cost if wrong: 6a waits on one extra merge.

- **Ruling 27 (the label for a doubly-scrubbed restore):** it reports `"blob-without-dynamic"` — the tier names the LAST and most severe scrub applied, and each rung's label implies every scrub above it. No fourth combined label: the ladder is ordered, so "reached rung 3" already says rung 2 ran. Recorded as a one-line rule on the tier's doc comment, since it is not self-evident from the value. Cost if wrong: an ambiguous label in a diagnostic, no behaviour impact.

- **Ruling 28 (the 250ms float-then-reload race is DOCUMENTED, not fixed here):** a user who floats a panel and reloads within ~250ms loses the float. It is real, but it is not float-specific — every layout mutation (drag, stack, close, resize) rides the same debounce, and #737 deliberately tightened when dispose may flush. Making `floatPanel` force an immediate write would change save semantics for one verb only, which is worse than the race. Task 11 documents it and STATUS gets a follow-up entry; the user hears it at acceptance. Cost if wrong: a rare lost float that a second float re-creates.

- **Ruling 29 (pending execution on resume — the 192 byte-only files come OUT):** revert the 192 perceptually-identical PNGs before opening the PR, keeping only the 130 that actually changed. A 322-file golden diff invites a reviewer to skim; a 130-file one says exactly what changed. This is the same tool behaviour that produced the seventh file in the flake fix's regen — the script rewrites what DIFFERS, not what FAILS, and at full-matrix scale that means re-encoding churn. Cost if wrong: none material; the reverted files are byte-churn with no pixel change, and a later regen would reproduce them identically.

- **Ruling 30 (Task 11's review is folded into the final whole-branch review):** the task is docs-only, and the final reviewer reads the whole branch against the spec anyway — so it receives Task 11's brief and report explicitly and gives Task 11 its own spec-compliance verdict inside that review. Deviates from one-review-per-task to save a seat under the user's stated token budget. Cost if wrong: a docs inaccuracy found at the final review instead of one step earlier, which is the same fix either way.

- **Ruling 31 (one fix wave, per the skill):** I1-I5, M1, M5, the three cheap deferred items (#1 R8 doc line, #2 selector prefix, #5 the misleading `intactPinOwnerSplit` comment) and all three docs corrections go to ONE fixer on the most capable model, catch-up #4 first since every other fix lands on its result. Cost if wrong: one large diff to re-review, which is the skill's design.

- **Ruling 32 (I3 is fixed, not ruled away):** the spec says hidden, and a button that does nothing is worse UX than no button. Both bridges hide the float control while `maximized !== null`. Cost if wrong: none — it matches the spec as approved by the user.

- **Ruling 33 (M3 parked):** Jarvis can collapse/maximize a floating panel; the machine records it, the engine refuses, and after docking home they disagree. Real, but reachable only through Jarvis's layout intents on a floating panel, and closing it properly needs the layout machine to know float state — which is layer 2, a design change the spec deliberately avoided (floats are layer 3). Parked with a STATUS follow-up. Cost if wrong: a Jarvis-driven collapse of a float is silently lost until the next layout reset.

- **Ruling 34 (M4 parked, M2 accepted):** pop-out-of-a-float has no test; jsdom can only witness pop-out's blocked-window branch, so a real test belongs to e2e and is a follow-up. M2's "seed-home" test asserting only `location === "grid"` stands — the reviewer's own probe showed the correct structure for all four panels. Cost if wrong *(added when this record was written, 2026-09-19 — the ledger omitted it)*: a regression in popping out a floating panel reaches users untested, and the seed-home test stays weaker than its name.

- **Ruling 35 (fixer's three behaviour calls):** (1) the I4 re-share also firing on a gesture drag-home is ACCEPTED — it is the "one mechanism for both entry points" I asked for. (2) Hiding the control during a maximize also hides a FLOATING panel's own Dock button — ACCEPTED: docking into a live-maximize grid lands the panel in a stripped layout, which is exactly the incoherence the spec's R3 exists to avoid, and drag-home still works; told to the user at acceptance. (3) A pin now releases AFTER the float detaches rather than before, and no real-browser test floats a pinned panel — ACCEPTED provisionally, and added to the controller's real-app checklist: float and dock home a PINNED rail panel and watch for a flash or a mis-sized rail. Cost if wrong on (3): a one-frame flash or a rail at the wrong width, visible in the real-app pass.

- **Ruling 36 (dock-home restores slot, not size):** shipped as-is and shown to the user. The spec promises the seed-home SLOT, and a proportional re-fit on dock-home is dockview's own behaviour for any re-inserted group. Restoring the pre-float size would need the engine to remember it — a small feature, not a bug fix — and the user should choose it rather than have it added silently. Cost if wrong: a follow-up task.

- **Ruling 37 (three residual Minors PARKED — no second fix wave, per the skill):**
  (a) an orphaned `RAIL_LIKE` doc comment after `ROW_WITH_INSTANCES` was inserted above it — cosmetic, test file only.
  (b) float fx-analytics, close it, reopen in the SAME tick → it returns clamped [367,367]; after 300ms it returns [100,MAX] as without a float. `settleFloatTransitions` re-clamps entries for closed panels, which are removed lazily. Harmless and self-limiting; one-line fix (drop entries whose panel is gone) recorded as a follow-up.
  (c) R5 row and `settleFloatTransitions`' doc overclaim that "a pop-out closing back into the GRID" runs through the hook — the grid-landing pop-out paths (`disposePopoutWindow`'s non-sole-member branch, `handleBlockedPopout`) carry no mutation bracket and re-clamp only at the next mutation. Rare and self-healing; doc correction recorded as a follow-up.
  Cost if wrong: (b) is the only behaviour one — a pin briefly holding on a same-tick close-reopen of a floated panel.

- **Ruling 38 (a golden for a floating panel — FOLLOW-UP, not now):** the spec keeps user-shaped floats out of the golden matrix, and that is why the see-through surface escaped every automated tier. A single seeded "one panel floating" scenario would have caught it. Recorded as a follow-up for the user to decide, since it amends an approved spec rule. Cost if wrong: the next float-paint regression also reaches acceptance before anyone sees it.

- **Ruling 39 (the Solid "computations created outside a createRoot" warning — PARKED as a follow-up):** not related to either bug; it fires on EVERY float click (and on closing a chart instance, pre-existing from Phase 4), because `onFloat={props.maximized === null ? … : undefined}` compiles to a memo inside a prop getter that the click handler reads outside any root. A small per-click reactive leak, dev-warned. The fix is to hoist the ternary out of the prop expression in both places; recorded for STATUS. Cost if wrong: one leaked computation per click in Solid, unbounded over a long session.

## What the rulings add up to

- **Seven assertions across four agents read true for a reason other than the
  thing they named** (Rulings 1, 2, 9, 12 and 20 exist because of this class). The
  working rule that caught them: before writing a test, say where in the lifecycle
  the difference becomes observable, assert there, and prove the test by reverting
  the fix and recording the failure.
- **Real-app acceptance found what every automated tier missed** — the see-through
  float in glass skins and the unpublished restored float — which is why Ruling 38
  proposed a floating-panel golden. The user approved it on 2026-09-19.
- **The user reversed Ruling 36** on 2026-09-19: dock-home now restores the
  panel's pre-float size, and the remembered size survives a reload.
