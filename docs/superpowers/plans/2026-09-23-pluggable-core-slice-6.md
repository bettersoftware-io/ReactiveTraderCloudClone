# Pluggable Application Core — Slice 6a (Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the regime slice 5's PR B proved: in-session implementation, one independent reviewer per PR). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give five shell members — the presenters `auth`, `bootGate`, `workspaceNav`, `animationDirector` and the machine `boot` — a behavioural contract suite each (green on RxJS first), then a native implementation in both alternative cores, so `pnpm core:parity` reads 58/74 for each core and `PENDING_SUITES` 16.

**Architecture:** Two PRs, as slice 5. **PR A (Tasks 1–3)** extracts the pure pieces the siblings must import rather than copy (boot cadence to `@rtc/domain`; `bootProgress`, `nextBootVariant`, `nextLoginWaitVariant`, `describeAuthFailure`, and the composition-level auth wiring `createAuthDeps` exported from `@rtc/client-core`), adds `CoreSeams.workspaceNav`, scripts `auth`/`sessionStore`/`bootSplash` in the `@rtc/core-contract` harness, and lands five suites. **PR B (Tasks 4–6)** makes the five native in the async core (Store/Topic/`sleep`) and the Effect core (`SubscriptionRef`/fibers/one Tag + Layer each), then records receipts and runs the gate. The layout/dock family moves to slice 7 (ruling 1).

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim), pnpm 12 + Turborepo, vitest 4.1 (`withFakeClock`), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — slice table row "6 shell"; "Pure reducers … are imported, not duplicated"; "The core-contract tier" ("driver verbs arrive with the slices that assert on them"). Slice 5: [`2026-09-22-pluggable-core-slice-5.md`](2026-09-22-pluggable-core-slice-5.md), rulings [`2026-09-22-pluggable-core-slice-5-rulings.md`](2026-09-22-pluggable-core-slice-5-rulings.md) — its COST section is the reason for this plan's regime.

## Global Constraints

- Every repo change ships via `./scripts/new-worktree.sh <name> --ready` → PR → CI green on the head SHA (`gh run list`, matched by `headSha`) → CodeQL alerts checked → `gh pr merge --merge`. PR A: `.claude/worktrees/core-slice-6`; PR B branches from `main` after PR A merges.
- `VITE_CORE_IMPL` stays unset in production; the RxJS core remains the shipped default.
- Outside each sibling's `bridge/`, `rxjs` / `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs`, grep gate 43).
- `@rtc/core-api` exports no runtime value (grep gate 42). `@rtc/core-contract` depends on `core-api`, `domain` (+ `rxjs`) only — never `client-core`.
- Biome `nursery/useExplicitType`, ESLint `padding-line-between-statements`, `no-restricted-syntax` (name inline object types), `rtc/name-fixture-factories` (`create*`), `rtc/name-functions-by-effect`; knip (no unused exports — keep Tags/helpers module-local unless imported).
- Never run two builds in one checkout at once; never run `pnpm mutation-check` while a gate or e2e run reads the same tree.
- Every new test is mutation-checked with `pnpm mutation-check <spec.json>` (commit first). A SURVIVED mutant is a finding about the test — strengthen it, or ledger it as equivalent / an untestable race guard with the reason.
- A test that reads state after a teardown reads a FRESH subscriber's seed, never a subscriber the teardown already cut (slice 5's recurring review finding).
- Never pipe or filter a Playwright run being judged; judge by exit code.
- Commit trailer and PR footer: the session's attribution lines.

## Rulings recorded up front

1. **Scope: slice 6a = `auth`, `bootGate`, `workspaceNav`, `animationDirector`, `machines.boot`.** The spec's row also names `layoutFor` and the dock bridges; those — `layoutFor`, `machines.layout`, `dockLayoutStore`, `dockPanel`, `undockPanel`, `dismissPanel`, `resetWorkspaceLayout`, `dockedPanelIdsFor`, `workspaceLayoutResets$`, `layoutPresets`, `commands.reportDetachedPanels` (11) — **move to slice 7**. Verified 2026-09-23 in `client-core/src/composition.ts`: every dock bridge calls `jarvisPanelsMachine` (a slice-7 member) synchronously, and `layoutFor`'s `layoutHandles` map is shared with the base's `JarvisDriverMachine`, `layoutPresets` and `resetWorkspaceLayout`. Porting them before `jarvisPanels` would need a seam that routes the base's Jarvis machines into native layout singletons AND native dock bridges back into the base's `jarvisPanels` — two-way scaffolding slice 7 deletes. Recorded in ADR-006; STATUS's slice-7 entry grows to include them. Cost if wrong: slice 7 is larger; nothing ships incorrectly.
2. **Constants to `@rtc/domain`** (`packages/domain/src/boot/bootCadence.ts`): `BOOT_DURATION_MS = 4200`, `BOOT_TICK_MS = 90`. `client-core` keeps exporting `BOOT_DURATION_MS` as a typed alias. The suites assert them.
3. **Pure pieces exported from `@rtc/client-core`, imported by the siblings:**
   - `bootProgress(tick: number): number` = `Math.min(100, Math.round((tick / Math.ceil(BOOT_DURATION_MS / BOOT_TICK_MS)) * 100))`; `nextBootVariant(v: BootVariant): BootVariant` (cyclic successor in `BOOT_VARIANTS`).
   - `nextLoginWaitVariant(v: LoginWaitVariant): LoginWaitVariant` (cyclic successor in `LOGIN_WAIT_VARIANTS`); `describeAuthFailure(reason: "invalid" | "unavailable"): string`.
   - `createAuthDeps(ports: AppPorts): AuthDeps` where `interface AuthDeps { readonly auth: AuthPort; readonly store: SessionStore; readonly cycle: LoginWaitCycle }` — the composition's current `withLoginDelay(...)` wrapper and the style-pin/auto cycle, moved verbatim out of `composition.ts`. `AuthPresenter` and `BootSequenceMachine` are rewritten onto these, behaviour-identically.
4. **`CoreSeams.workspaceNav?: Machine<WorkspaceNavState, WorkspaceNavIntents>`.** The base's `JarvisDriverMachine` (`switchTab` drive command) and the dock bridges' `latestActiveTab` mirror read `seams.workspaceNav ?? ownNav`, while `presenters.workspaceNav` stays the base's own instance. Witness (each sibling's `composition.seams.test.ts`): a Jarvis drive batch `{ kind: "switchTab", tab: "credit" }` lands on the app's NATIVE `workspaceNav`, the base's own stays `"fx"` — the slice-4 `eqWorkspace` witness shape.
5. **`animationDirector` needs no seam.** No internal reader of the base consumes it (verified: only UI reads `presenters.animationDirector`). The native director is built from the native members directly (`currencyPairs.pairs$`, `priceStream.price$`, `connection.status$`, `execution.executions$`, `rfqs.events$`, `ordersBlotter.fills$`); the base's own director is lazy (`shareReplay` refCount) and stays cold. The existing seam test "the base app's own readers hold no port a native member already holds" keeps passing with the director native (it subscribes `app.presenters.animationDirector.intentsFor("tile:EURUSD")`); its two director-specific test titles ("…reaches the base's own animationDirector") are renamed to say "the app's animationDirector".
6. **Contracts** (all under `withFakeClock` where time moves):
   - **`workspaceNav`** — synchronous `{ activeTab: "fx" }`; `switchTab(t)` → `{ activeTab: t }`; `switchTab` to the current tab emits nothing (the RxJS `distinctUntilChanged`); retained across a full unsubscribe (a late subscriber sees the latest tab).
   - **`bootGate`** — `visible` and `visible$` start at `bootSplash.shouldPlay()` (harness seed), `true` when the port is absent; `dismiss()` → false, `reboot()` → true, both synchronously visible through the `visible` getter AND to a `visible$` subscriber; `visible$` replays the current value to a late subscriber.
   - **`auth`** — resume: a stored session with `exp > now` starts `authenticated` with its user; `exp <= now` starts `unauthenticated` AND clears the store. `login` → synchronous `authenticating` with `waitVariant` = the cycle's current, and the cycle advanced to `nextLoginWaitVariant`; outcome `ok` → `authenticated`, the session written; `invalid` / `unavailable` → `unauthenticated` with `describeAuthFailure(reason)`. `lock()` only when authenticated (no-op otherwise). `unlock(pw)` → `unlocking: true`, re-login as the current user; ok → unlocked + session rewritten; failure → `locked: true, unlocking: false, error`. `unlock` with no current user is a no-op. `logout()` → store cleared, `UNAUTHENTICATED` state. Uncontracted: an in-flight login's outcome arriving after `logout()` (the RxJS core commits it; nothing guards it), and outcome ordering of two overlapping logins.
   - **`animationDirector`** — `intentsFor("tile:EURUSD")`: a second price tick emits `tickUp` when `mid` rose or held, `tickDown` when it fell; the first tick emits nothing; a pair dropped from `pairs$` stops emitting. An execution outcome `Done` → `fill`, otherwise `reject`, on `tile:<symbol>`. `rfqClosed` with state `Expired` → `expiry` on `rfq:<id>`; `quoteAccepted` → `fill` on `rfq:<rfqId>`. A connection status CHANGE → `connectionChange` on `banner:connection`; the current status replayed at subscribe emits nothing. A filled equity order → `fill` on `ticket:<symbol>`. Intents for other targets never reach a subscriber. R5 applies: settle between counted emissions.
   - **`machines.boot`** (via `machines.boot(onDone)`) — creation calls `bootPreference.setVariant(nextBootVariant(current))` exactly once, synchronously; first state `{ variant: current, progress: 0, done: false }`; progress follows `bootProgress(tick)` at `BOOT_TICK_MS`; at `BOOT_DURATION_MS` the state is `done: true, progress: 100` and `onDone` has run exactly once; `skip()` → `{ progress: 100, done: true }` immediately and `onDone` once, never again when the ramp would have ended; `dispose()` before done → no further states, `onDone` never runs.
7. **Port discipline** gains `auth.login` — constancy: one call per `login()`/`unlock()` intent, none at construction or resume.
8. **Counts:** 74 members; 53 + 5 = **58** native per sibling; `PENDING_SUITES` 21 − 5 = **16**.

## Review Focus

1. **Double-submit login** (user presses Enter twice) — both outcomes commit in arrival order in RxJS; a person expects the screen to settle on the latest attempt. Uncontracted (ruling 6); Task 3 adds a suite case pinning only that the FINAL state after both resolve `ok` is `authenticated` — true in every order.
2. **A stored session expiring exactly now** (`exp === now`) — expected: treated as expired (the RxJS `>` is strict). Task 3's auth suite pins the boundary with `vi.setSystemTime(exp)`.
3. **`unlock` after `logout`** — expected: nothing happens (no login call). Task 3 asserts `pendingLogins()` stays empty.
4. **`skip()` after the ramp already finished** — expected: `onDone` still ran exactly once. Task 3's boot suite covers it.
5. **Tab switch spam** (`switchTab("credit")` twice) — expected: one emission. Task 3's nav suite covers it.

## File structure

```
packages/domain/src/boot/bootCadence.ts                    NEW  BOOT_DURATION_MS, BOOT_TICK_MS (ruling 2)
packages/domain/src/index.ts                               MOD
packages/client-core/src/presenters/shellFolds.ts          NEW  bootProgress, nextBootVariant, nextLoginWaitVariant, describeAuthFailure
packages/client-core/src/presenters/__tests__/shellFolds.test.ts  NEW
packages/client-core/src/adapters/authDeps.ts              NEW  createAuthDeps (moved from composition.ts)
packages/client-core/src/presenters/{AuthPresenter,BootSequenceMachine}.ts  MOD  onto the folds
packages/client-core/src/composition.ts                    MOD  createAuthDeps; CoreSeams.workspaceNav (ruling 4)
packages/core-contract/src/harness/scriptedPorts.ts        MOD  scripted auth + session store + bootSplash; verbs
packages/core-contract/src/suites/{workspaceNav,bootGate,auth,animationDirector,boot}.ts  NEW
packages/core-contract/src/suites/portDiscipline.ts        MOD  auth.login
packages/core-contract/src/registry.ts (+ .test.ts)        MOD  five suites; PENDING_SUITES 16
packages/client-core-async/src/presenters/shell.ts         NEW  bootGate, auth, animationDirector
packages/client-core-async/src/machines/{workspaceNav,boot}.ts  NEW
packages/client-core-effect/src/presenters/shell.ts        NEW
packages/client-core-effect/src/machines/{workspaceNav,boot}.ts  NEW
packages/client-core-{async,effect}/src/{composition.ts|layers.ts,parity.json,composition.seams.test.ts}  MOD
docs: ADR-006, §22, STATUS, CLAUDE.md, both READMEs, spec receipt, the slice-6 rulings file  MOD (Task 6)
```

(each new source file gets its co-located `*.test.ts`)

---

## PR A — the RxJS side

### Task 1: Pure shell pieces, boot cadence, `createAuthDeps`, `CoreSeams.workspaceNav`

**Files:** as the file structure's domain + client-core lines.

**Produces:** `BOOT_DURATION_MS`, `BOOT_TICK_MS` (domain); `bootProgress`, `nextBootVariant`, `nextLoginWaitVariant`, `describeAuthFailure`, `createAuthDeps`, `AuthDeps` (client-core, exported from its index); `CoreSeams.workspaceNav`.

- [ ] **Step 1:** Write `shellFolds.test.ts` first: `bootProgress(0) === 0`; `bootProgress(Math.ceil(4200 / 90)) === 100`; `bootProgress(1000) === 100` (clamped); `nextBootVariant` of the last variant is the first; `nextLoginWaitVariant` likewise; `describeAuthFailure("invalid") === "Invalid credentials"`, `("unavailable") === "Service unavailable"`. Run — fails (no module).
- [ ] **Step 2:** Create `bootCadence.ts` (explicit `: number` types) and `shellFolds.ts`; export both from their package indexes. Run — passes.
- [ ] **Step 3:** Rewrite `BootSequenceMachine` onto `bootProgress`/`nextBootVariant`/the domain constants and `AuthPresenter` onto `nextLoginWaitVariant`/`describeAuthFailure`; move the `withLoginDelay` wrapper + cycle out of `composition.ts` into `adapters/authDeps.ts` as `createAuthDeps(ports)`, and construct `new AuthPresenter(deps.auth, deps.store, undefined, deps.cycle)` from it. Run `pnpm --filter @rtc/client-core test` — every existing Auth/Boot/composition test still passes (behaviour-identical).
- [ ] **Step 4:** Add `readonly workspaceNav?: Machine<WorkspaceNavState, WorkspaceNavIntents>` to `CoreSeams`. Keep the base's own `createWorkspaceNavMachine()` instance as `presenters.workspaceNav` (parity's reference-inequality test needs the base to hold its own), and route only the INTERNAL readers — the Jarvis driver deps' `workspaceNav` and the `latestActiveTab` mirror — through `seams.workspaceNav ?? ownNav`. This is the `eqWorkspace` precedent (`eqWorkspace: seams.eqWorkspace ?? eqWorkspace` in the driver deps only).
- [ ] **Step 5:** `client-core` test for the seam: `createApp(ports, { workspaceNav: fake })` + a Jarvis `switchTab` drive batch → `fake` received `switchTab("credit")`, `app.presenters.workspaceNav` still `"fx"`. Mutation-check Steps 1 and 5. Commit: `refactor(client-core): extract the shell's pure pieces; CoreSeams.workspaceNav`.

### Task 2: Harness — scripted auth, session store, boot splash

**File:** `packages/core-contract/src/harness/scriptedPorts.ts` (+ test).

**Produces:** seed fields `session?: StoredSession | null`, `bootSplash?: boolean`; driver verbs `pendingLogins(): readonly LoginCall[]` (`interface LoginCall { readonly username: string; readonly password: string }`), `resolveLogin(outcome: AuthOutcome): void` (settles the OLDEST pending), `storedSession(): StoredSession | null`; `PortMethodName` + `"auth.login"`. `StoredSession` and `SessionStore` are already `@rtc/core-api` types (`src/adapters.ts`); `AuthOutcome` is `@rtc/domain`'s.

- [ ] **Step 1:** Tests: `login` calls queue FIFO and `resolveLogin` settles the oldest; the store starts at the seed and `write`/`clear` are visible through `storedSession()`; `bootSplash` seed `false` makes `ports.bootSplash.shouldPlay()` false, absent seed leaves `bootSplash` undefined. Run — fails.
- [ ] **Step 2:** Implement with the existing `createPendingQueue` (as `throughputWrites`), a closure-backed store, and `countCalls` on the auth port with prefix `"auth."`. Run — passes. Mutation-check. Commit.

### Task 3: Five suites, port discipline, registry — then ship PR A

**Files:** the five suites; `portDiscipline.ts`; `registry.ts` + `registry.test.ts`.

- [ ] **Step 1:** One suite per member, each case exactly as ruling 6 states it, plus Review Focus 1–5. Rules: subscribe BEFORE driving (slice 5's must-fix); read post-teardown state from a fresh subscriber; `withFakeClock` for boot and director; `vi.setSystemTime` for the auth `exp` boundary.
- [ ] **Step 2:** `portDiscipline`: `auth.login` — zero calls after construction and resume; one per `login()`; one per `unlock()`.
- [ ] **Step 3:** Register the five; `PENDING_SUITES` loses them (16 left); `registry.test.ts` count.
- [ ] **Step 4:** `pnpm --filter @rtc/client-core test` (RxJS runner) green; both sibling runners green (they delegate). Mutation-check every suite case against the RxJS core (mutate `AuthPresenter`, `BootSequenceMachine`, `AnimationDirector`, `WorkspaceNavMachine`, `BootGatePresenter` — one mutant per contract point). Commit this plan and `docs/superpowers/plans/2026-09-23-pluggable-core-slice-6-rulings.md` (the live ledger) with the PR.
- [ ] **Step 5:** Full gauntlet; one read-only reviewer on the diff; take its findings; push; CI; merge.

## PR B — the ports

### Task 4: The async core

- [ ] **Step 1: `workspaceNav`** — `machines/workspaceNav.ts`: `createStore({ activeTab: "fx" })`, `switchTab(t)` → `store.set((s) => s.activeTab === t ? s : { activeTab: t })` (the Store drops `Object.is`-equal writes, giving `distinctUntilChanged`); `storeToWarmStateStream`; `lifetime` abort releases.
- [ ] **Step 2: `bootGate`** — `createStore(bootSplash?.shouldPlay() ?? true)`; `visible$` = `storeToStateStream(store)`; `visible` getter = `store.get()`.
- [ ] **Step 3: `auth`** — a `Store<AuthViewState>` seeded by the same `resume()` logic over `createAuthDeps(ports)`; `login`/`unlock` via `once(deps.auth.login(u, p), lifetime)` in `spawn`, committing exactly as the RxJS `commit*Outcome` do; everything else synchronous.
- [ ] **Step 4: `animationDirector`** — a topic per source over the native members (`topicFromObservable`), `intentsFor(target)` = a refCounted topic filtering the merged intents (replay-1, as the RxJS `shareReplay`); the pairwise tick per pair re-keyed on each `pairs$` roster (the RxJS `switchMap`).
- [ ] **Step 5: `boot`** — `machines/boot.ts`: `setVariant(nextBootVariant(current))` at creation; a `spawn`ed loop `for tick 0..` `store.set({ variant, progress: bootProgress(tick), done })`, `await sleep(BOOT_TICK_MS, signal)` until done; `skip()` aborts the loop and sets done; `onDone` guarded to run once; `dispose()` aborts.
- [ ] **Step 6:** Composition: the five native; `seams.workspaceNav = native.workspaceNav`; `parity.json` five `"native"`; the ruling-4 witness; rename the two director seam-test titles (ruling 5). `pnpm --filter @rtc/client-core-async test`; mutation-check; commit.

### Task 5: The Effect core

Same five, as slice 5's Effect half: `SubscriptionRef` + `refToWarmStateStream` for `workspaceNav`/`bootGate`/`auth`; `rpc(...)` forked into a child host for the logins; the director as `sharedFold`s/mirrors over the native streams; `boot` as a fiber of `Effect.sleep(BOOT_TICK_MS)` steps in a child host, `skip` interrupting it. One Tag + Layer each (module-local Tags, knip). `layers.test.ts` count +5 (42 → 47). Unit tests tick before reading state (it follows the ref on a fiber). Mutation-check; commit.

### Task 6: Docs, status, gate — ship PR B

- [ ] ADR-006 "Decided in slice 6" (rulings 1, 4, 5 and anything execution changed); §22 counts and the shell shapes; spec receipt; STATUS (58/74, slice 7 now includes the layout/dock eleven; delete the empty "Slice-4 residuals" heading; add a one-line pointer to ADR-006 Follow-ups 2–4 as deferred-by-design); CLAUDE.md counts; both READMEs; the rulings ledger.
- [ ] `pnpm core:parity` → 58/74 both; full gauntlet; `VITE_CORE_IMPL=async` and `=effect` `pnpm test:e2e`; one reviewer; push; CI; merge.

## Self-review

**Spec coverage.** Row "6 shell": `workspaceNav`, `boot`, `bootGate`, `auth`, `animationDirector` → Tasks 3–5. `layoutFor` + dock bridges → moved to slice 7 by ruling 1, with the reason and the STATUS/ADR record in Task 6. "Imported, not duplicated" → Task 1. "Driver verbs arrive with the slices that assert on them" → Task 2.

**Placeholders.** None found. Sibling implementations are algorithms over named primitives, as slice 5's plan; the slice-5 PR B halves are the worked examples.

**Type consistency.** `AuthDeps`, `createAuthDeps`, `bootProgress`, `nextBootVariant`, `nextLoginWaitVariant`, `describeAuthFailure`, `BOOT_DURATION_MS`, `BOOT_TICK_MS`, `LoginCall`, `pendingLogins`, `resolveLogin`, `storedSession`, `CoreSeams.workspaceNav` — defined in Tasks 1–2, consumed by name in 3–5. Counts: 53 + 5 = 58; 21 − 5 = 16; Effect layers 42 + 5 = 47.

**Review Focus.** Five lines, each with its test assigned to Task 3.
