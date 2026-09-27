# Pluggable Application Core — Slice 7, Wave 2 (Jarvis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the regime slices 5–7 proved: in-session implementation, one independent reviewer per PR). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the last four delegated members — `jarvis`, `jarvisUsage`, `jarvisDriver`, `jarvisDemo` — plus the internal `NarratorMachine` native in both alternative cores (70 → **74/74**), delete the `CoreSeams.workspace` factory, and fix the driver's "applied" report for a refused dock.

**Architecture:** Three PRs, as in wave 1. **PR A** (the RxJS side) extracts the Jarvis family's synchronous logic into shared, rxjs-free controllers in `@rtc/client-core`. It also moves the constants the suites need into `@rtc/domain`, turns the two WS-only Jarvis extras into optional `JarvisPort` members so the contract can reach them, adds harness verbs and four suites, and adds the `CoreSeams.nativeJarvis` stand-down seam. **PR B** ports the async core and **PR C** ports the Effect core. Each builds its own Jarvis family first and hands its own `events$` to its own workspace. PR C then deletes the `workspace` factory, which by then nothing uses.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim), pnpm 12 + Turborepo, vitest 4.1 (`withFakeClock`), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md): row "7 jarvis"; "Pure reducers … are imported, not duplicated"; "driver verbs arrive with the slices that assert on them". Wave 1: [`2026-09-24-pluggable-core-slice-7.md`](2026-09-24-pluggable-core-slice-7.md) + [rulings](2026-09-24-pluggable-core-slice-7-rulings.md). This wave's live ledger: `2026-09-24-pluggable-core-slice-7-wave-2-rulings.md`, committed with PR A.

## Global Constraints

- Every repo change ships via `./scripts/new-worktree.sh <name> --ready` → PR → CI green on the head SHA (`gh run list`, matched by `headSha`) → CodeQL alerts checked (`gh api …/code-scanning/alerts?ref=refs/pull/N/head&state=open`) → `gh pr merge --merge` → `git merge-base --is-ancestor` → remove the worktree and branch → fast-forward the primary checkout. PR A lives in `.claude/worktrees/core-slice-7-wave-2`. PRs B and C each branch from `main` after the previous PR merges.
- `VITE_CORE_IMPL` stays unset in production; the RxJS core remains the shipped default.
- Outside each sibling's `bridge/`, `rxjs` / `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs`, grep gate 43). The PR A controllers import **no** rxjs value, because the siblings call them.
- `@rtc/core-api` exports no runtime value (grep gate 42). `@rtc/core-contract` depends on `core-api`, `domain` and `shared` types (+ `rxjs`) only, never `client-core`, so every constant a suite asserts against lives in `@rtc/domain` (ruling 3).
- Biome `nursery/useExplicitType`, ESLint `padding-line-between-statements`, `no-restricted-syntax` (name inline object types), `rtc/name-fixture-factories` (`create*`), `rtc/name-functions-by-effect`. knip: no unused exports. Every new client-core module a sibling imports is exported from `src/index.ts`, because knip does not catch a missing entry export.
- Never run two builds in one checkout at once. Never run `pnpm mutation-check` while a gate or e2e run reads the same tree.
- Every new test is mutation-checked with `pnpm mutation-check <spec.json>` (commit first). A SURVIVED mutant is a finding about the test: strengthen the test, or ledger the mutant as equivalent (or as an untestable race guard) with the reason.
- Subscribe BEFORE driving. Read post-teardown state from a FRESH subscriber's seed. In suites, settle before reading a stream (the Effect core delivers on a fiber).
- A hot source a native member folds is subscribed EAGERLY at construction (wave 1's lost-turn bug: the Effect lazy relay dropped a same-tick turn). A warm stream is fed from the commit path, never from a lazily-subscribed `changes` (wave 1's orphan-scrub bug).
- Never pipe or filter a Playwright run being judged; judge by exit code.
- `pnpm-lock.yaml` drift → `git checkout -- pnpm-lock.yaml`, never commit it.
- Commit trailer and PR footer: the session's attribution lines.

## Rulings recorded up front

1. **Scope.** Members: `jarvis` (the `JarvisMachineHandle` including `events$`), `jarvisUsage`, `jarvisDriver`, `jarvisDemo`, plus `NarratorMachine`. The narrator is internal and has no parity row. It is contracted through `jarvis`, since its only output is a narration turn. `jarvisPreferences` was native in slice 1b and is untouched. Counts: 70 + 4 = **74** per sibling; `PENDING_SUITES` 4 → **0**.

2. **Shared controllers, not ports, for synchronous logic.** This is wave 1's ruling 2 applied to Jarvis. Every module below imports no rxjs value, lives in `@rtc/client-core` and is exported from `src/index.ts`. The RxJS machines become shells over them, behaviour-identical, and the existing 5,600 lines of Jarvis unit tests pass UNCHANGED (the regression net).
   - `presenters/jarvisController.ts`: the state is a plain `JarvisState`; every change is a `JarvisPatch = (s: JarvisState) => JarvisState` that each core applies to its own container (RxJS `scan`, async `Store.set`, Effect `SyncRef.update`).
     - Pure patch factories: `JARVIS_INITIAL_STATE`, `openPatch`, `closePatch`, `togglePatch`, `skinPatch(skin)`, `approvePatch(confirm)`, `declinePatch(confirm)`. The last two keep today's shape: the port's `confirm` runs inside the patch, and only when a confirmation is pending.
     - `confirmTotalTicks(timeoutMs): number` = `max(1, round(timeoutMs / 1000))`.
     - `createJarvisController(): JarvisController` owns the session scalars today's closure holds (`nextEntryId`, `inFlightEntryId`, `available`, `availability`, `preferredBrain`, `effectiveBrain`, `effort`):
       ```ts
       type JarvisTurnRequest =
         | { readonly kind: "send"; readonly text: string }
         | { readonly kind: "sendScripted"; readonly text: string }
         | { readonly kind: "narrate"; readonly prompt: string };
       interface JarvisTurnPlan {
         readonly wireText: string;
         readonly options: JarvisAskOptions;           // { brain, effort }
         readonly origin: "narrator" | undefined;
         readonly start: JarvisPatch;                  // appends user entry + jarvis stub, phase "speaking"
       }
       interface JarvisController {
         /** Called when the turn is DEQUEUED (not when requested) — today's
          * concatMap timing: `null` while unavailable (the silent no-op), else
          * allocates both entry ids and marks the jarvis stub in flight. */
         planTurn(req: JarvisTurnRequest): JarvisTurnPlan | null;
         /** Today's `eventPatch`; clears the in-flight id on done/error. */
         eventPatch(event: JarvisEvent, origin: "narrator" | undefined): JarvisPatch;
         /** `null` for a "skipped" outcome; allocates the entry id otherwise. */
         driveOutcomePatch(outcome: DriveOutcome): JarvisPatch | null;
         availabilityPatch(value: JarvisAvailability): JarvisPatch;
         preferredBrainPatch(brain: JarvisBrain): JarvisPatch;
         setEffort(effort: JarvisEffort): void;
         /** One countdown tick; at the last tick it calls `confirm(id, false)` and
          * returns the clearing patch (today's `timerPatches$` body). */
         confirmTickPatch(req: { confirmationId: string }, ticksElapsed: number,
                          totalTicks: number, confirm: JarvisPort["confirm"]): JarvisPatch;
       }
       ```
     - `JARVIS_SIM_AVAILABILITY` (today's `DEFAULT_AVAILABILITY`), `formatGateResetTime`, `formatGateHint` and `formatBrainHint` move here too. `JarvisMachine.ts` re-exports every moved name.
   - `presenters/jarvisDriveCommands.ts`: `applyDriveCommand(cmd: DriveCommandV1, deps: DriveCommandDeps): DriveOutcome` (today's `safeApplyCommand` + `applyCommand` + `applyLayoutCommand`, verbatim except ruling 6) and `driveStaggerMs(index: number, level: PowerSaverLevel): number` (`0` for the first command, and under `"freeze"`; otherwise `DRIVE_STAGGER_MS`). `DriveCommandDeps` replaces every `Observable` read with a synchronous reader:
     ```ts
     interface DriveCommandDeps {
       readonly switchTab: (tab: WorkspaceTab) => void;
       readonly layout: (tab: WorkspaceTab) => Machine<LayoutState, LayoutIntents>;
       readonly eqWorkspace: EqWorkspaceIntents;
       readonly eqWorkspaceState: () => EqWorkspaceState | undefined;  // undefined → FALLBACK_EQ_STATE
       readonly setThemeSkin: (skin: ThemeSkin) => void;
       readonly setPowerSaver: (level: PowerSaverLevel) => void;
       readonly dismissPanel: (panelId: string) => void;
       readonly dockPanel: (panelId: string) => boolean;                // ruling 6
       readonly undockPanel: (panelId: string) => void;
       readonly knownLayoutPanelIds: (tab: WorkspaceTab) => readonly string[];
       readonly detachedPanelIds: (tab: WorkspaceTab) => readonly string[];
       readonly livePanelIds: () => readonly string[];
       readonly dockedPanelIds: () => readonly string[];
       readonly knownSymbols: () => readonly string[] | undefined;      // undefined = "watchlist not loaded"
     }
     ```
     The RxJS `JarvisDriverDeps` keeps its observable fields. Its shell adapts them with the existing `readLatest` / `readNow`.
   - `presenters/jarvisDemoScript.ts`: `JARVIS_DEMO_STEPS`, `guideCommand`, `JARVIS_DEMO_INITIAL_STATE`, `demoBeatMs(level)`, `advanceDemoPatch(step, index)`, `lastEntryId(entries)`, plus the step watcher:
     ```ts
     type DemoStepSignal = "decline" | "done" | "error" | null;
     interface DemoStepWatch {
       observeState(state: JarvisState): void;        // flips "started" via turnHasStarted
       observeEvent(event: JarvisEvent): DemoStepSignal; // null until started; "decline" once, on the first confirmRequest of an awaitsConfirmation step
     }
     function createDemoStepWatch(step: JarvisDemoStep, watermark: number): DemoStepWatch;
     ```
     Each core keeps the timing: the beat before the decline, the per-step `DEMO_STEP_TIMEOUT_MS`, the beat between steps, `exhaustMap`-style start, stop-cancels-run, and the overlay tracker.
   - `presenters/narratorGate.ts`: `NarratorGateState`, `NARRATOR_INITIAL_GATE`, `admitAnomaly(state, event, now)`, `formatNarrationPrompt(event)`.
   - `@rtc/domain`'s `jarvis/anomalyDetector.ts` gains the pure step `createAnomalyDetector(config?: Partial<AnomalyDetectorConfig>): (tick: PriceTick) => readonly AnomalyEvent[]`. `detectAnomalies` becomes a `defer` + `scan` shell over it, and its existing tests pass unchanged.
   - Cost if wrong: slice 8 relocates more code into `@rtc/core-logic`; nothing ships incorrectly.

3. **Constants to `@rtc/domain`** (`packages/domain/src/jarvis/jarvisConstants.ts`, following wave 1's `workspaceLimits.ts`): `JARVIS_CONFIRM_TIMEOUT_MS = 60_000`, `JARVIS_GREETING` (verbatim), `JARVIS_NARRATION_PREFIX = "[narration] "`, `NARRATION_COOLDOWN_MS = 300_000`, `MAX_NARRATIONS_PER_SESSION = 4`, `DEMO_STEP_BEAT_MS = 1200`, `DEMO_STEP_TIMEOUT_MS = 30_000`. `client-core` re-exports its existing names from these, so `ui-contract`'s `JARVIS_GREETING` import keeps working. The demo's step COMMANDS stay in client-core (`JARVIS_GUIDE_CATALOG`). The suites read them from `pendingAsks()` and never hard-code them.

4. **The WS-only extras become optional `JarvisPort` members** in `@rtc/core-api`:
   ```ts
   availability$?(): Stream<JarvisAvailability>;
   setHistorySource?(source: () => readonly JarvisHistoryEntry[]): void;
   ```
   - `WsJarvisAdapter` already implements both; `ScriptedJarvisAdapter` implements neither.
   - `composition.ts` swaps both `instanceof WsJarvisAdapter` checks for optional calls: `ports.jarvis.availability$?.()` and `ports.jarvis.setHistorySource?.(…)`.
   - Why: with `instanceof`, a core that cannot import the class (the contract harness), and so every native port, would leave the availability/gate fold and the history wiring (~150 lines) uncontracted. This overrules the old "jarvisPort.ts's surface stays unchanged" note: the surface widens only by optional members, and no adapter changes.
   - Cost if wrong: one type widening to revert.

5. **The stand-down seam: `CoreSeams.nativeJarvis?: true`.** "A sibling core owns the Jarvis family and its workspace." When it is set, the base builds each member so that nothing reaches a port or the wire:
   - its `JarvisMachine` gets no `availability$` (the wire availability request is cold, so it would be sent twice);
   - `wireJarvisHistorySource` is skipped (`setHistorySource` is a single-slot port method, so exactly one core may call it);
   - no `NarratorMachine` is built (it would `ask` a second time per anomaly);
   - the panels machine, the driver and the demo fold `EMPTY` instead of the base's own `jarvis.events$`;
   - the workspace skips the boot restore and builds no persistence writer (wave 1's one-writer rule, now keyed on `nativeWorkspace !== undefined || seams.nativeJarvis === true`).

   `presenters.*` keep the base's own instances, because the parity drift test needs them. PR A adds the seam next to `workspace`. PRs B and C switch each sibling over. **PR C deletes `CoreSeams.workspace`, `WorkspaceSeam` and the factory branch** once no sibling passes it.

   Witness (client-core `composition.seams.test.ts`, extended), with `createApp(ports, { nativeJarvis: true })` over a counting jarvis port:
   - `availability$` is called 0 times and `setHistorySource` 0 times;
   - an anomaly burst with the narrator preference `"on"` produces 0 `ask`s;
   - a dock through the base's own `dockPanel` writes nothing within 2× the debounce.

   The sibling-side witness is port discipline (ruling 8): each is called exactly once per app.

6. **The driver's refused dock (STATUS residual, `107efdd88`).** `WorkspaceDock.dockPanel` returns `boolean`: `true` only when the panel ended up docked by this call. `Presenters.dockPanel` stays `(id) => void` in core-api, since a boolean-returning function is assignable to it. `applyDriveCommand`'s `dockPanel` case runs its three pre-checks unchanged (unknown, already docked, dock full). When `deps.dockPanel(id)` then returns `false`, the outcome is `{ status: "refused", reason: \`${cmd.panelId} collides with a workspace panel id\` }`, and the transcript reads `can't dockPanel: …`. The STATUS line is deleted in PR A. The fix reaches the siblings through delegation, and through the shared controller once they go native.

7. **Contracts** (`withFakeClock` wherever time moves). Turns are driven through the harness: `jarvis.intents.send("x")`, then `replyJarvis([...events, { type: "done" }])`.
   - **`jarvis` — transcript and turns**
     - The seed is the greeting only (`JARVIS_GREETING`, id 0).
     - `send` appends a user entry and an empty jarvis stub, sets `phase` to `"speaking"` and issues exactly one `ask` whose options carry the effective brain and the current effort preference.
     - `delta`s concatenate into the stub. `toolEvent` sets `tool`. `done` → `phase: "idle"`, stub `done`.
     - `error` replaces the stub's text with the message and drops `tool`.
     - A second `send` during a turn issues NO second ask until the first turn's `done`, and turn 2's deltas never touch turn 1's entry.
     - `send` while unavailable is a silent no-op (no entry, no ask).
     - `narrate(prefix + "p")` asks with the prefixed wire text; the transcript shows `"p"` with `origin: "narrator"`.
     - `sendScripted` asks with `brain: "scripted"` and leaves `origin` unset.
     - `events$` replays nothing to a late subscriber, and emits each turn event once, in order.
   - **`jarvis` — overlay**
     - `open` sets `open`, zeroes `unread`, clears `unreadNarration`, and increments `openCount` only on closed→open. `close` keeps `openCount`. `toggle` does both directions.
     - A `done` while closed → `unread + 1`. A narrate turn done while closed → `unreadNarration: true`, but not while open.
   - **`jarvis` — confirmation**
     - A `confirmRequest` sets `pendingConfirmation` with `remainingFraction: 1`. After each 1 s it is `1 - n/60`.
     - At `JARVIS_CONFIRM_TIMEOUT_MS` the harness records `confirm(id, false)` and the card clears.
     - `approveConfirmation` → `confirm(id, true)`, cleared, and no further tick or timeout confirm. `declineConfirmation` → `confirm(id, false)` likewise.
     - Both are no-ops with nothing pending.
     - A second `confirmRequest` supersedes the first countdown: only the second id ever times out.
   - **`jarvis` — skin, brain, availability, history, drive outcomes**
     - `skin` follows the `jarvisSkin` preference; `setSkin` writes it.
     - With the harness availability `{ brains: ["scripted","haiku"], defaultBrain: "scripted" }`, a `jarvisBrain` preference of `"haiku"` → `effectiveBrain: "haiku"`. Un-offering haiku → `"scripted"`.
     - A gate that MOVES the effective brain after the first turn appends one `origin: "system"` line ("Usage budget reached — continuing on …"). A gate that does not move it appends nothing.
     - `available: false` → `send` is a no-op.
     - The history source, read through the harness, is the transcript minus the in-flight turn and minus system lines.
     - `recordDriveOutcome` appends `drive: <kind>` for applied, `can't <op>: <reason>` for refused, and nothing for skipped.
   - **`jarvis` — narrator** (the `narratorConfig` seed gives a small window)
     - A price spike with preference `"on"` → exactly one `ask` whose text starts with `JARVIS_NARRATION_PREFIX`.
     - With preference `"off"` → none.
     - A second anomaly inside `NARRATION_COOLDOWN_MS` → none; after it → one.
     - At most `MAX_NARRATIONS_PER_SESSION` in total.
   - **`jarvisDriver`**
     - A `command` event resets `lastBatch` to `[]`, then applies the first command at once and each later one `DRIVE_STAGGER_MS` apart. Under power-saver `"freeze"` they are 0 apart.
     - `outcomes$` emits each outcome in application order.
     - Per kind:
       - `switchTab` moves `workspaceNav`;
       - `eqSelect` of a symbol not on the watchlist is skipped;
       - `eqIndicator` / `eqPane` already at the requested value are skipped;
       - `setTheme` and `setPowerSaver` write their preference;
       - `dockPanel` of a live panel docks it;
       - `dockPanel` of a live panel whose id collides with a static panel → **refused** (ruling 6);
       - `undockPanel` of an undocked id is skipped.
     - A second batch arriving mid-stagger waits for the first to finish, and its reset comes after the first batch's last outcome.
     - Layout ops and `reportDetachedPanels` stay in wave 1's suites.
   - **`jarvisDemo`**
     - `startDemo` opens the overlay and sets `running`, `stepIndex: 1` and the first label. It issues one scripted ask.
     - A `done` reply → the next ask after `DEMO_STEP_BEAT_MS` (0 under `"freeze"`).
     - On the EXECUTION step, a `confirmRequest` → `confirm(id, false)` one beat later, never `true`.
     - The MORNING WORKSPACE step closes the overlay.
     - After the last step: overlay open, state back to initial.
     - An `error` reply aborts to initial with the overlay open.
     - No reply within `DEMO_STEP_TIMEOUT_MS` aborts.
     - `startDemo` while running is ignored.
     - `stopDemo` mid-run → initial and no further asks. `stopDemo` during the confirmation step declines. `stopDemo` after MORNING WORKSPACE reopens the overlay.
   - **`jarvisUsage`**: `usage$` starts with `null`, then follows the port's snapshots, and replays the latest to a late subscriber.

8. **Port discipline widens** (these are construction-time counts, pinned against the RxJS core's measured numbers before a sibling is ported):
   - `jarvis.availability$` exactly once;
   - `jarvis.setHistorySource` exactly once;
   - `jarvis.ask` zero, then one per `send` (as in wave 1);
   - `jarvis.confirm` zero;
   - `jarvisUsage.usage$` at most once across two subscribers and two warm periods.

   Together these are the proof that `nativeJarvis` really stood the base down.

9. **Harness** (`scriptedPorts.ts`, core-contract only):
   - The jarvis port gains `availability$` (a replaying source seeded from `jarvisAvailability?: JarvisAvailability`, default the sim value `{ available: true, brains: ["scripted"], defaultBrain: "scripted", gate: null }`) and `setHistorySource`.
   - Verbs:
     - `pushJarvisAvailability(a)`;
     - `jarvisHistory(): readonly JarvisHistoryEntry[] | null` (null before any source is set);
     - `askLog(): readonly { readonly text: string; readonly options?: JarvisAskOptions }[]` (every ask ever made, in order);
     - `confirmations(): readonly { readonly id: string; readonly approved: boolean }[]`;
     - `pushJarvisUsage(payload)`.
   - A scripted, counted `jarvisUsage` port (`"jarvisUsage."`).
   - Seed `narratorConfig?: Partial<AnomalyDetectorConfig>`, passed through as `AppPorts.narratorConfig`.
   - `PortMethodName` gains `"jarvis.confirm" | "jarvis.availability$" | "jarvis.setHistorySource" | "jarvisUsage.usage$"`.

10. **Native shapes** (PRs B and C). Each core builds the family in this order: jarvis → workspace (wave 1's `createNativeWorkspace`, now handed the native `events$`) → driver (with `outcomes$` → `jarvis.intents.recordDriveOutcome`) → demo → narrator → history-source wiring → usage.
    - **`jarvis`**:
      - State commits synchronously (async `Store`, Effect `SyncRef`), so the demo's watermark and `stopDemo`'s pending-confirmation read can peek it.
      - The turn queue is serial: one ask at a time, `planTurn` at dequeue.
      - The countdown is a superseding run (async `createRunSlot` + `sleep(1000)` loop; Effect: a forked fiber interrupted by supersede, approve, decline or dispose).
      - `events$` is a hot topic fed as each turn's events arrive.
      - `dispose` stops the queue, the countdown and the preference subscriptions.
    - **Driver**: a serial batch queue, `driveStaggerMs` sleeps, `applyDriveCommand`, a `lastBatch` store, an `outcomes$` topic.
    - **Demo**: an exhaust-style run slot with abort on `stopDemo`, `createDemoStepWatch` per step, a timeout race per step, beats.
    - **Narrator**: per-pair tick subscriptions (switch on the roster) → `createAnomalyDetector` → preference-gated `admitAnomaly` (`now` = the core's clock) → `narrate`.
    - **Usage**: a warm replay of the port starting with `null`.
    - Effect: one module-local Tag + Layer per member; `layers.test.ts` count updated, counted when written.

## Review Focus

1. **A second question typed while Jarvis is still answering the first.** Expected: it waits its turn, and the answers never interleave. Covered by the ruling-7 case "second send during a turn"; Task 3 also adds a three-deep queue where the middle turn errors.
2. **Stopping the demo while its trade-confirmation card is up.** Expected: the trade is declined, never approved, and no later step fires. Task 3's demo suite adds it (`confirmations()` shows exactly one `false`, and `askLog()` stops growing).
3. **An anomaly while the user's own turn is streaming.** Expected: the narration queues behind that turn; it neither drops nor interleaves. Task 3's narrator case adds it.
4. **A drive batch that docks a panel, then an undock in a second batch sent immediately.** Expected: both apply in order, and the transcript shows two `drive:` lines. Task 3's driver suite adds it.
5. **Dispose mid-countdown.** Expected: no `confirm(id, false)` fires after `jarvis.dispose()`. Task 3 adds it to the confirmation group, and each sibling's unit test repeats it against its own countdown.

## File structure

```
packages/domain/src/jarvis/jarvisConstants.ts                          NEW  ruling 3
packages/domain/src/jarvis/anomalyDetector.ts                          MOD  createAnomalyDetector
packages/core-api/src/adapters.ts                                      MOD  optional JarvisPort members (ruling 4)
packages/client-core/src/presenters/{jarvisController,jarvisDriveCommands,jarvisDemoScript,narratorGate}.ts  NEW (+ tests)
packages/client-core/src/presenters/{JarvisMachine,JarvisDriverMachine,JarvisDemoMachine,NarratorMachine}.ts  MOD  shells
packages/client-core/src/layout/workspaceDock.ts                       MOD  dockPanel → boolean
packages/client-core/src/{composition,index}.ts                        MOD  nativeJarvis, optional port calls
packages/core-contract/src/harness/scriptedPorts.ts                    MOD  ruling 9
packages/core-contract/src/suites/{jarvis,jarvisDriver,jarvisDemo,jarvisUsage}.ts  NEW  (jarvis may split into a kit + files, as workspaceKit)
packages/core-contract/src/suites/portDiscipline.ts                    MOD  ruling 8
packages/core-contract/src/registry.ts (+ .test.ts)                    MOD  PENDING_SUITES 0
packages/client-core-async/src/presenters/{jarvis,jarvisDriver,jarvisDemo,narrator,jarvisUsage}.ts  NEW (+ tests)
packages/client-core-effect/src/presenters/{jarvis,jarvisDriver,jarvisDemo,narrator,jarvisUsage}.ts NEW (+ tests)
packages/client-core-{async,effect}/src/{composition.ts|layers.ts,parity.json,composition.seams.test.ts}  MOD
docs: ADR-006, §22, STATUS, CLAUDE.md, both READMEs, spec receipt, the wave-2 rulings file  MOD
```

---

## PR A — the RxJS side

### Task 1: Constants, the pure anomaly step, optional port members

**Produces:** ruling 3's constants (re-exported from their old client-core homes); `createAnomalyDetector`; ruling 4's optional members, with `composition.ts` calling them optionally.

- [ ] **Step 1:** `jarvisConstants.ts` + a test pinning each value (a mutant per constant must go RED). Point client-core's existing names at them. Run `pnpm --filter @rtc/domain test && pnpm --filter @rtc/client-core test`. Expected: all green, and no client-core test edited.
- [ ] **Step 2:** Tests for `createAnomalyDetector`: nothing before `minWindowFill`; a spread spike emits one `spreadWidening`; it does not re-emit while still above; it re-arms after falling back; zero variance never emits; symbols are independent. Run: FAIL (not defined). Move the `scan` body into the step, and rewrite `detectAnomalies` as `defer(() => { const step = createAnomalyDetector(config); return ticks$.pipe(mergeMap((t) => step(t))); })`, keeping its operator shape. Run the domain tests. Expected: new and old green.
- [ ] **Step 3:** Ruling 4, TDD.
  - FIRST add the `composition.jarvisHistory.test.ts` case: a plain-object jarvis port that HAS `setHistorySource` gets wired. Run it against the untouched `composition.ts`: FAIL, because `instanceof` rejects it.
  - Then add the optional members to `JarvisPort`, and replace both `instanceof WsJarvisAdapter` checks with optional calls (the `wireJarvisHistorySource` param becomes `AppPorts["jarvis"]`).
  - Run: the new case PASSES, and the file's existing cases pass unchanged.
- [ ] **Step 4:** Mutation-check Steps 1–3's new tests. Commit `refactor(domain,client-core): jarvis constants, the pure anomaly step, optional JarvisPort extras`.

### Task 2: Extract the four controllers; fix the refused dock; the stand-down seam

**Consumes:** Task 1. **Produces:** ruling 2's modules and exact names; ruling 6; ruling 5's `CoreSeams.nativeJarvis`.

- [ ] **Step 1: `jarvisController.ts`.** Move the patch helpers verbatim, then rewrite `createJarvisMachine` as a shell. `turnItems$` calls `controller.planTurn` inside the `concatMap` (dequeue time) and returns `EMPTY` on `null`. `entryPatches$` uses `plan.start` and `controller.eventPatch`. `timerPatches$` uses `confirmTickPatch`. The remaining streams map to the patch factories. Diff the moved lines with `git diff --color-moved` before running. Run `pnpm --filter @rtc/client-core test`. Expected: `JarvisMachine.test.ts` (2,629 lines) green and unedited. Add direct controller tests only for branches `pnpm coverage:gaps` shows uncovered in the new file.
- [ ] **Step 2: `jarvisDriveCommands.ts`.** Move `applyCommand` / `applyLayoutCommand` / `safeApplyCommand` behind `DriveCommandDeps`. The RxJS shell builds the readers from its observables (`readNow` / `readLatest`) and computes the stagger with `driveStaggerMs`. `JarvisDriverMachine.test.ts` is green and unedited.
- [ ] **Step 3: Ruling 6, TDD.** New `JarvisDriverMachine.test.ts` case: a live panel whose id is a static layout id (spawn it through the panels fake) plus a `dockPanel` whose fake returns `false` → outcome `refused` with ruling 6's reason. Run: FAIL (reports `applied`). Implement: `WorkspaceDock.dockPanel` returns `boolean` (the collision, already-docked and not-docked-after returns give `false`; the success path gives `true`), and the driver deps type becomes `(id) => boolean`. Add a `workspaceDock` test that pins each return value. Run: PASS. Also add a `composition.jarvis.test.ts` case: end to end through `createApp`, a drive batch docking a static-colliding live id leaves the transcript's last entry `can't dockPanel: …`. Delete the STATUS residual line.
- [ ] **Step 4: `jarvisDemoScript.ts`** (steps table, `guideCommand`, `createDemoStepWatch`, `advanceDemoPatch`, `demoBeatMs`, `lastEntryId`) and **`narratorGate.ts`** (the gate + prompt). The two machines become shells, and the narrator's pipeline switches to `createAnomalyDetector` via `detectAnomalies` (unchanged call). `JarvisDemoMachine.test.ts` and `NarratorMachine.test.ts` are green and unedited. Add a direct `createDemoStepWatch` test: an event before `started` → `null`; a second `confirmRequest` → `null`; `done` → `"done"`.
- [ ] **Step 5: The seam (ruling 5), TDD.** Write the ruling-5 witness in `composition.seams.test.ts`. Run: FAIL (the seam doesn't exist). Implement:
  - `seams.nativeJarvis` gates `availability$`, `wireJarvisHistorySource` and the narrator build;
  - `const baseEvents$ = seams.nativeJarvis ? EMPTY : jarvisEvents$` feeds panels, driver and demo;
  - the idle-workspace condition becomes `nativeWorkspace !== undefined || seams.nativeJarvis === true`.

  Run: PASS. Export every new name from `src/index.ts`, then run `pnpm knip`.
- [ ] **Step 6:** Mutation-check every new test from Steps 1–5 (and, at minimum, one mutant per ruling-5 gate). Commit `refactor(client-core): the Jarvis family's shared controllers; the refused dock reports refused; CoreSeams.nativeJarvis`.

### Task 3: Harness, four suites, port discipline, registry — then ship PR A

- [ ] **Step 1: Harness (ruling 9), TDD.** In `scriptedPorts.test.ts`:
  - `askLog` records the text and options of every ask, and survives the reply;
  - `confirmations` records in order;
  - `availability$` replays the seed, then pushes;
  - `jarvisHistory` is `null` until set, then reads the source live;
  - `usage$` follows `pushJarvisUsage`;
  - the `narratorConfig` seed reaches `ports.narratorConfig`.

  Run: FAIL. Implement. Run: PASS. Mutation-check. Commit.
- [ ] **Step 2: Suites (ruling 7)** plus Review Focus 1–5, one file per member (a `jarvisKit.ts` for the shared turn helper `completeTurn(h, events)` if the jarvis suite splits). Assert only on constants from `@rtc/domain` and on values read back from the app, never on copied literals.
- [ ] **Step 3: Port discipline (ruling 8).** First measure each count on the RxJS core and write it into the case; they must hold unchanged on both delegating siblings.
- [ ] **Step 4:** Register the four; `PENDING_SUITES` becomes empty; update the `registry.test.ts` count. Run `pnpm --filter @rtc/core-contract test && pnpm --filter @rtc/client-core-async test && pnpm --filter @rtc/client-core-effect test`. Expected: all three runners green (both siblings still delegate).
- [ ] **Step 5:** Mutation-check every suite case against the RxJS core: one mutant per contract point, placed in the SHARED controller where the rule now lives, plus one in each RxJS shell (turn serialisation, countdown supersede, stagger, demo exhaust, narrator cooldown). Rebuild client-core first (the mutation-test stale-dist rule).
- [ ] **Step 6:** Commit this plan + the wave-2 rulings ledger. Run the full gauntlet (`/rtc:gauntlet full`). Get one read-only reviewer on the diff; take its findings (each fix RED→GREEN); push; wait for CI; merge.

## PR B — the async core

### Task 4

- [ ] **Step 1: `presenters/jarvis.ts`**, per ruling 10.
  - Unit tests first, over a fake port. Each one fails before it passes:
    - turn serialisation;
    - `planTurn` at dequeue;
    - countdown supersede;
    - dispose mid-countdown (Review Focus 5);
    - `availability$` absent → sim availability;
    - an eager `events$` so a same-tick turn is not lost.
  - Then implement: a `Store<JarvisState>` + `createJarvisController()`; a serial queue (`spawn` loop draining a request array, each turn `for await` over `bridge` `fromPort(port.ask(...))`); the countdown in a `createRunSlot`; `events$` as a Topic; preferences relayed via `relay(..., lifetime)`.
- [ ] **Step 2: `jarvisDriver.ts`, `jarvisDemo.ts`, `narrator.ts`, `jarvisUsage.ts`**, each with unit tests first. Driver: batch serialisation and stagger. Demo: exhaust, stop, timeout. Narrator: cooldown under the fake clock; the preference switched off mid-session. Usage: null start and replay.
- [ ] **Step 3: Composition.**
  - Build the family inside `nativePresenters` in ruling 10's order.
  - `createNativeWorkspace` takes the NATIVE `jarvis.events$`.
  - Pass `nativeJarvis: true` and drop the `workspace` factory, `builtWorkspaces` and the throw.
  - Wire `outcomes$ → recordDriveOutcome` and `setHistorySource` natively.
  - `parity.json`: four more `"native"`.
  - `composition.seams.test.ts`: a drive batch from a NATIVE turn lands on the native workspace; the base's `layoutFor("fx")` never moves; the port counts are ruling 8's.
- [ ] **Step 4:** `pnpm --filter @rtc/client-core-async test` (contract 74/74 native). Mutation-check. Run `VITE_CORE_IMPL=async pnpm test:e2e`, judged by exit code; the Jarvis demo/driver/dock e2e are the integration witness. Full gauntlet, one reviewer, ship.

## PR C — the Effect core

### Task 5

- [ ] **Step 1:** The same five members as Task 4, as slice 6's and wave 1's Effect halves:
  - `SyncRef` state, with `warm()` fed from the commit path;
  - the turn queue as a `Queue` + one consuming fiber in the core's `EffectHost`;
  - the countdown as a forked fiber interrupted on supersede, approve, decline or dispose;
  - the ask stream entering through `fromPortIn(scope)` (eager);
  - the driver and demo as fibers with `Effect.sleep`, and the demo timeout as `Effect.timeout`;
  - the narrator as a `sharedFold` per roster, with `Clock.currentTimeMillis` as `now`;
  - usage via `holdWarm`.

  Unit tests first, ticking before each read.
- [ ] **Step 2:** Composition / `layers.ts` as Task 4 Step 3, plus one Tag + Layer per member and the `layers.test.ts` count. `parity.json`; witnesses.
- [ ] **Step 3: Delete the factory.** `CoreSeams.workspace`, `WorkspaceSeam` and the `nativeWorkspace` branch in `createApp`; the idle condition becomes `seams.nativeJarvis === true`. Update client-core's seams test. Run `rg -n "WorkspaceSeam|seams\.workspace"` across `packages/`: it must come back empty.
- [ ] **Step 4:** Mutation-check; `VITE_CORE_IMPL=effect pnpm test:e2e`; gauntlet.
- [ ] **Step 5: Docs** (in this PR):
  - ADR-006 "Decided in slice 7 — wave 2" (rulings 2, 4, 5, 6, plus anything execution changed);
  - §22: counts (74/74), the Jarvis shapes, and the factory's deletion;
  - the spec receipt;
  - STATUS: slice 7 closed, slice 8 next;
  - CLAUDE.md counts ("seventy of 74" → "all 74", and the per-package lines);
  - both READMEs;
  - the rulings ledger.

  Then one reviewer, ship.

## Self-review

**Spec coverage.** Row "7 jarvis": `jarvisPanels` shipped in wave 1. `jarvis`, `jarvisDriver`, `jarvisDemo`, `jarvisUsage` and `NarratorMachine` are covered by Tasks 2–5. "Imported, not duplicated": ruling 2, Task 2. "Driver verbs arrive with the slices that assert on them": ruling 9, Task 3. Wave 1's promised factory deletion: ruling 5, Task 5 Step 3. The STATUS residual: ruling 6, Task 2 Step 3.

**Placeholders.** None. Two cuts are decided during execution by a stated rule: whether the jarvis suite splits into a kit plus files (Task 3 Step 2, by length), and the Effect layer count (counted when written).

**Type consistency.** These names are defined in rulings 2–6 and 9 and consumed by the same names in Tasks 2–5:
- `JarvisPatch`, `JarvisTurnRequest`, `JarvisTurnPlan`, `createJarvisController`/`JarvisController` (`planTurn`, `eventPatch`, `driveOutcomePatch`, `availabilityPatch`, `preferredBrainPatch`, `setEffort`, `confirmTickPatch`);
- `applyDriveCommand`/`DriveCommandDeps`/`driveStaggerMs`;
- `createDemoStepWatch`/`DemoStepWatch`/`DemoStepSignal`;
- `admitAnomaly`/`NARRATOR_INITIAL_GATE`/`formatNarrationPrompt`;
- `createAnomalyDetector`;
- `CoreSeams.nativeJarvis`;
- `askLog`/`confirmations`/`jarvisHistory`/`pushJarvisAvailability`/`pushJarvisUsage`.

Counts: 70 + 4 = 74; `PENDING_SUITES` 4 − 4 = 0.

**Review Focus.** Five lines, each with its test assigned to Task 3 (Review Focus 5 also to Tasks 4 and 5).
