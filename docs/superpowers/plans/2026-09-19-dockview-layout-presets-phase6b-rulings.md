# Dockview Layout Presets (Phase 6b) — Execution Rulings

**Plan:** [2026-09-19-dockview-layout-presets-phase6b.md](2026-09-19-dockview-layout-presets-phase6b.md) · **Spec:** [../specs/2026-09-15-dockview-floats-and-presets-design.md](../specs/2026-09-15-dockview-floats-and-presets-design.md) §4 · **Status:** implementation and tests complete on `worktree-saved-layouts`, 2026-09-20, pending the controller's real-app pass, user acceptance and merge.

The plan was written before implementation, and a further pre-flight scan was
run against it before any task was dispatched. Between the two, 19 decisions
were taken on the user's behalf — where the plan or the pre-flight scan was
wrong, silent, or overtaken by what a task actually found. Each is recorded as
**what was decided — why — what it costs if wrong**, so a later reader can
tell a deliberate choice from an accident and knows what to revisit if one
turns out wrong. This file is the durable copy: the working ledger they came
from (`.superpowers/sdd/2026-09-19-dockview-layout-presets-phase6b/progress.md`)
is git-ignored scratch and does not survive the branch.

Rulings are grouped by when they were taken — before any task ran (the plan's
own pre-execution rulings, then the pre-flight scan's), then in task order.
References to "Task N" are the plan's tasks; "#7xx" are other PRs on `main`
during execution.

## Pre-execution rulings (taken while writing the plan)

- **P1 — The store port is raw strings, not typed records.** The design spec
  sketches `list/save/remove` over a typed `StoredLayoutPreset`. Each web
  client already carries its own `LocalStorage*Store` copy (there are two
  `LocalStorageDockLayoutStore`s), so a typed port would put parsing and the
  unreadable-record rule into three adapters (two localStorage + in-memory)
  instead of one. `LayoutPresetStore` instead mirrors `DockLayoutStore`
  (`load(tab): string | null` / `save(tab, serialized)`), and one codec in
  `client-core` parses and serializes. Why: one implementation of the only
  tricky part. Cost if wrong: a later server-side store would want typed
  records — a new port then, with the codec moving behind it; nothing
  UI-facing changes.
- **P2 — Docked Jarvis panels are excluded from presets, and survive a load
  or a Default in place.** Confirmed by the user before execution started. A
  docked panel is live session content owned by `JarvisPanelsMachine` (a
  global cap, session-unique ids, a live roster) — restoring one from a
  preset could collide with a live id or break the cap. So a save strips
  docked leaves (the stored record's `docked` is always `[]`), and a
  load/Default re-inserts whatever is docked into that tab *right now*. One
  rule for both: a layout operation rearranges; it never creates or destroys
  content. Chart instances ARE recorded — they are layer-2 state with no
  owner outside the layout machine. Cost if wrong: a user who expected Jarvis
  panels to come back exactly as a preset recorded them — they are still
  there, just re-docked at the seed position; the reverse (resurrecting a
  dismissed panel) would have been worse.
- **P3 — The draft name lives in component state; the rules live in core.**
  The dumb-UI rule bans rxjs/localStorage/fetch in `src/ui`, not view state —
  `ViewMenu` already holds `open` in `useState`, and the "Save current as…"
  draft string is the same kind of ephemeral view state. Every *rule* (trim,
  length, reserved, duplicate, cap) is `validateLayoutPresetName` plus the
  controller's `save` result, in `client-core`. Cost if wrong: moving the
  string into the presenter later is local to two components.
- **P4 — Rebuild reuses `workspaceLayoutResets$`.** Only the active tab's
  engine is mounted, and both bridges already rebuild in place on a bump of
  that counter, with a save-suppression guard. A second counter would
  duplicate that effect in both bridges. The counter's name now understates
  it; its doc comment was updated, and renaming it was ruled out of scope (it
  would churn ~12 fake/binding files for no behaviour change). Cost if wrong:
  Task 1's decision gate (below) finds the rebuild inexact and the fallback
  — an in-place `engine.restoreLayout(blob)` — is taken instead.
- **P5 — Visual: the new Dockview menu shot is single-engine.** The design
  spec asks for both a Dockview and an in-house variant of the new golden.
  The in-house variant is the existing `shell/view-menu-open` (it now shows
  the Default row, so its golden repaints); the Dockview one is a new
  `shell/view-menu-layouts-dockview` with seeded presets and deliberately NO
  un-suffixed twin — a pair whose rows differ by design would read as a
  whole-row divergence in `pnpm visual:engine-parity` forever, and
  `enginePairs.ts` already skips a `-dockview` scenario with no sibling.
  Cost if wrong: one extra scenario later.
- **P6 — A wholly unreadable preset list surfaces as ONE unreadable row**
  (id `UNREADABLE_LIST_ID`), and `save` refuses (`store-unreadable`) until
  that row is deleted — deleting it clears the key. Overwriting silently
  would destroy the user's data; dropping it silently is the repo's named
  absence class. Cost if wrong: a user with corrupt storage must click
  delete once before saving.

## Pre-flight rulings (taken before Task 1 was dispatched, from the pair/consistency scan over the whole plan)

- **R1 — `client-core` re-exports the new core-api preset types.** `T4 → T6`
  in the pre-flight scan found a gap: `LayoutPresetSummary` and
  `SaveLayoutPresetResult` live in `@rtc/core-api`, but `ui-contract` and both
  clients import app types from `@rtc/client-core`. So Task 4 additionally
  re-exports them (`export type { … } from "@rtc/core-api"`), exactly as
  `dockLayoutStore.ts` re-exports `DockLayoutStore` — without it, Task 11's
  `AppData` field could not name `LayoutPresetSummary` without a new
  dependency edge. Cost if wrong: a duplicate import path for one type;
  nothing behavioural.
- **R2 — Task 12 links the rulings file from the plan header.** Without an
  "Execution rulings:" line pointing at it, this file is unreachable from the
  plan — the exact failure the "commit SDD rulings before cleanup" doctrine
  exists to prevent. Cost if wrong: none.

## Ledger rulings (taken task by task, in the order they were made)

- **Ruling (pre-flight, Task 7's duplication) — the two React
  `createDockEngine` construction bodies stay duplicated verbatim.** A
  reviewer could flag the duplication as worth extracting into a shared
  helper. Pre-ruled instead: the duplication is load-bearing and documented
  in the file itself (its own "REBUILD CONTRACT" comment), and ADR-003 bans
  the memoized helper that would make sharing it safe under React Compiler.
  Task 7 adds the snapshot registration to BOTH copies rather than
  extracting one. Cost if wrong: the two copies drift over time — mitigated
  by the file's own doc comment and by Task 7's tests covering both the
  mount and the rebuild path.
- **Ruling (Task 2) — the vacuous half of a `popoutGroups` scrub test is not
  worth a fix round.** `createDockEngine.test.ts`'s case (c) has a real half
  (the float scrub) and a vacuous half: jsdom blocks `window.open`, so the
  `popoutGroups` key is never present and that assertion passes whether or
  not the scrub runs. Ruled: leave it — the scrub's real coverage lives in
  `dockBlob.test.ts`'s units and the relocated code is byte-identical to
  before the refactor — but flag it to the final review's triage list rather
  than let it keep looking like coverage it is not, since this is the
  repo's own named "absence reported as a clean reading" class. Cost if
  wrong: a reader trusts a test that proves less than it appears to.
- **Ruling (Task 4) — two of the brief's inline object types became named
  types.** `save`'s `options` parameter and `validateLayoutPresetName`'s
  return value were sketched as inline object types in the plan's own code
  snippets, which violates this repo's unconditional no-inline-object-type
  ESLint rule (no suppressions policy). Accepted as written: they became
  `SaveLayoutPresetOptions` / `ValidateLayoutPresetNameResult`, with
  byte-identical fields — the plan's snippets were the offenders, not a
  reason to relax the rule. Cost if wrong: two extra exported type names,
  no shape change for any consumer.
- **Ruling (Task 4) — the whole-list unreadable sentinel is filtered
  structurally in the serializer, not left to prose.** The sentinel
  (`UNREADABLE_LIST_ID`) serializes as its raw value (`null`), so a careless
  rewrite of the list could overwrite the user's still-unreadable data; the
  design spec assigns that discipline to the controller's `store-unreadable`
  refusal, which is prose-level protection only. Folded a structural guard
  (skip the sentinel inside the serializer itself, not at each caller) into
  the same fix round, since Task 5's controller is exactly the caller that
  would otherwise trip it. Cost if wrong: one extra branch in the
  serializer — the alternative was user data protected by a comment instead
  of by code.
- **Ruling (Task 5) — the `latestStateOf` guard throwing is correct, and
  `save` must be assumed capable of throwing from here on.** The reviewer
  judged that a throwing guard (rather than one that silently proceeds) is
  right: the alternative would silently store an unstripped tree that the
  codec then rejects on read — a vanishing preset, the repo's named absence
  class, which is worse than a thrown error the caller can show. Carried
  consequence, explicitly flagged into the Task 8/9 dispatches: `save`'s
  contract is a result union, but the UI layer must NOT assume it cannot
  also throw. Cost if wrong *(added when recorded)*: a UI path that calls
  `save` without a try/catch would let an unstripped-tree edge case surface
  as an unhandled exception instead of a refusal message.
- **Ruling (Task 8) — accept a `<fieldset aria-label="Layouts">` over the
  plan's `<div role="group">`.** Biome's `a11y/useSemanticElements` rejects
  `role="group"` on a `div`, and this repo bans lint suppressions
  unconditionally. The implicit role of a `fieldset` is still `group` — both
  clients' page objects assert `getByRole("group", { name: "Layouts" })`, so
  the change is pinned at the accessibility-tree level, not just visually.
  Cost if wrong: a `fieldset` inside a `role="menu"` dropdown is unusual
  markup, but it is legal HTML and the role assistive tech sees is
  unchanged.
- **Ruling (Task 8) — reversing an earlier dispatch note: the snapshot slot
  is NOT wired into `DockviewEngineHost.tsx`.** An earlier note in the
  ledger (written before Task 8 ran) had said the contract-World Dockview
  host must also receive Task 7's `onSnapshotSourceChange` slot, or the
  save-flow spec would get `unavailable` instead of `saved`. Task 8's own
  implementer reasoned better: every contract spec that exercises save mounts
  the real `App` (where the wiring already lives), and that host serves only
  `DockviewEngine.contract.spec.ts`, which owns no save case — so wiring the
  prop there would be unexercised fixture code. Accepted, reversing the
  earlier instruction. Cost if wrong: a future save-flow spec written
  against that host would silently get `unavailable` — mitigated because
  every save case asserts the message is `null`, so such a spec would fail
  loudly rather than pass.
- **Ruling (Task 8) — spec 4 substitutes a stronger assertion for the plan's
  literal one.** The plan asked spec 4 to prove a replace-save by a changed
  `savedAt` timestamp, but no World-exposed preset store exists (the seed is
  write-only) and comparing `savedAt` at millisecond resolution with no
  injected clock would be flaky. The spec instead maximizes a panel between
  two saves, replaces, restores, and loads the record back, asserting the
  maximized panel plus an unchanged row count and preset id — deterministic,
  and strictly stronger than a timestamp compare would have been. Cost if
  wrong: the literal "savedAt changed" reading stays unproven; proving it
  would need a World-owned store plus an injected clock.
- **Ruling (Task 8) — Default-under-Dockview is proven by Task 10's e2e, not
  by an added contract case.** The plan only specs Default under the
  in-house engine; under Dockview, Default must also rebuild the dock tree,
  which a jsdom contract spec cannot witness as convincingly as a real
  rebuild. Folded a Default-under-Dockview step into Task 10's e2e instead
  of adding a weaker jsdom case. Cost if wrong: the Dockview Default path
  stayed proven only at presenter level until Task 10 landed — which it now
  has, and this is exactly the step that surfaced the pre-existing product
  bug described below.
- **Ruling (Task 10) — keep the Solid bridge regression test even though it
  cannot distinguish hardened from unhardened Solid.** The stale-closure fix
  described under "Findings worth keeping" below has a React-side test that
  DOES discriminate (reverting the guard reproduces the real crash) and a
  Solid-side test that does NOT (reverting Solid's `liveEngine()` hardening
  leaves the same test passing, because Solid's reactive read cannot itself
  go stale the way React's captured `engine` variable could — this is a
  convergent hardening, not evidence of an independent Solid bug). Kept
  anyway: it is a genuine regression test for the feature, gives test-shape
  parity with React, and is captioned in its own file as non-discriminating
  so a future reader is not misled. Cost if wrong: a future reader might
  still over-read it as proof the Solid hardening was load-bearing — the
  in-file caption is the mitigation; the alternative (deleting it) would
  leave Solid's reopen-on-rebuild path with no unit coverage at all.

## Findings worth keeping

Facts this phase measured that later work would otherwise have to
re-derive, now that the scratch ledger they came from is gone:

- **A rewrite of a stored preset list is not byte-stable.** The codec
  reconstructs a split node's `children` before its `sizes` on parse, so a
  round-tripped list is not a byte-for-byte copy of what was stored even
  when nothing changed semantically. Any test or tool that writes a preset
  list must assert over the PARSED records, never a raw string compare.
- **The codec refuses a preset whose tree still carries a docked leaf.**
  If the docked-leaf-stripping rule (P2) ever regresses, the failure mode is
  a preset that silently disappears from the list on the next read — not a
  phantom Jarvis panel reappearing. That is a deliberate consequence of
  keeping the codec strict, and it means "a saved layout vanished" is the
  right first hypothesis for a P2 regression, not "a Jarvis panel came back
  wrong."
- **jsdom DOES reproduce the "Invalid grid element" crash described below.**
  A draft comment written mid-fix claimed jsdom could not reliably reproduce
  the double-commit window that triggers it. That claim was checked by
  experiment (weakening the fixed guard back to `if (engine === null)`) and
  disproved: the real `Invalid grid element` stack surfaced in jsdom every
  time. The comment was corrected in place before this branch closed — a
  claim about a test environment's limits should be measured, not assumed,
  exactly like every other "this can't be tested here" claim this phase
  ran into.
- **The Solid twin of the bridge regression test cannot distinguish
  hardened from unhardened code**, for the reason given in the last ledger
  ruling above: it is real coverage of the feature, not evidence the fix
  was necessary in Solid specifically.

## Measured facts Task 1 pinned before any preset code was written

Task 1 characterized the shipped `workspaceLayoutResets$` rebuild path as a
preset-load mechanism, with committed regression tests, before Task 5's
controller was allowed to depend on it (P4's decision gate):

1. **A newer blob written to the dock store wins** over an older one once
   the rebuild counter bumps — the fresh engine is seeded from the latest
   write, not a stale one.
2. **Layer-2 state (collapse, etc.) replays onto the NEW engine instance**,
   not lost to the outgoing engine's disposal.
3. **No stale overwrite follows a load** — the outgoing engine's own armed
   final save does not clobber the just-written blob, provided the write and
   the rebuild land in one synchronous batch (this is the origin of the
   controller's "one batch" rule described in the layout-dockview README's
   saved-layouts section).
4. **A docked panel reconciles back in** after the rebuild, via the same
   mechanism that already re-adds a listed chart instance.

All four came back YES on both React and Solid, so Task 5's load order
stands exactly as the plan sketched it (store write → `replaceLayout` →
counter bump) — no in-place `restoreLayout` fallback was needed. A fifth
question — whether a live pop-out window closes and its panel lands
correctly per a preset load — could not be witnessed in jsdom (it blocks
`window.open`) and was deferred to, and later covered by, Task 10's e2e.

## The pre-existing product bug this phase found and fixed

Task 10's extra Default-under-Dockview step (the ruling above) exposed a
bug that predates Phase 6b entirely: each client's Dockview bridge has a
`closed`-panel reconciliation effect, and its four siblings (maximize,
docked, instances, collapsed) all carry a stale-closure guard that this one
was missing. So closing a panel from the View menu and then triggering
**any** dock rebuild — including the already-shipped "Reset workspace
layout" — crashed dockview-core with `Invalid grid element` and unmounted
the whole engine. Reproduced standalone with nothing preset-related
involved (close a panel, click Default). Fixed with a one-line guard
addition in React; Solid's parallel effect had the same gap in a different
shape (it read a non-reactive `engine` variable instead of the tracked
`liveEngine()`) and was hardened for parity, though its timing never
actually crashed — see the ledger ruling above for why that leaves Solid's
test non-discriminating.

## What the rulings add up to

- **Every rule that governs what a preset does or does not capture (P1, P2,
  P6, and the sentinel-filter ruling) exists in exactly one place** — the
  `client-core` codec and controller — never re-implemented in a fake or an
  adapter. Task 6's review confirmed this by grepping both contract Worlds
  for a re-implemented cap, name check or load order and finding none.
- **The phase's own "absence reported as a clean reading" catches (the
  vacuous `popoutGroups` half, the self-caught vacuous rebuild test in
  Task 7, the Solid non-discriminating test, and the corrected "jsdom can't
  reproduce this" comment) are now four-for-four examples of the same
  discipline**: before trusting a test, ask where in the lifecycle the
  difference it claims to prove becomes observable, and prove it by
  reverting the fix and watching the test go red.
- **The controller's own Default-under-Dockview real-rebuild path is what
  found a bug the entire automated test estate had missed for as long as
  "Reset workspace layout" has existed** — a reminder that even a
  deliberately weaker test-tier choice (Ruling: Default-under-Dockview
  proven by e2e, not a contract case) can still be the one that finds
  something a stronger-looking unit test never would, simply by exercising
  the real engine.
