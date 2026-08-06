# Jarvis P5 — App-Driving + Proactive Narrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis drives the app (a `drive_app` tool dispatching intents on client-core machines via a closed `DriveCommand` vocabulary) and proactively narrates deterministic anomalies (domain detector → capped client-side narration turns), plus the machine-boundary thesis showcase.

**Architecture:** Mirror of generative-UI round 1: closed JSON vocabulary in `@rtc/shared` validated both ends, one additive `JarvisEvent` wire variant, a WS-surface tool composed into `AnthropicAgentSession` (never `@rtc/agent-tools`), a session-lifetime client-core fold machine with injected handles, scripted-brain zero-token paths, both web clients at parity. Spec: [../specs/2026-08-05-jarvis-app-driving-narrator-design.md](../specs/2026-08-05-jarvis-app-driving-narrator-design.md).

**Tech Stack:** TypeScript, RxJS, @rx-state/core, Anthropic SDK (server-only), Vitest (+ marble tests), Playwright.

## Global Constraints

- **No Anthropic API calls in any CI-run test.** `tests/scripts/jarvis-live-smoke.ts` is the only real-key surface (manual).
- **Closed vocabulary, validated both ends:** server tool gate (`parseDriveBatch`) AND client parse seam (`WsJarvisAdapter`). Client re-validation uses shape only; membership (panelId/symbol) is checked in the driver.
- **Additive wire only:** new `SERVER_MSG.JARVIS_COMMAND` + one new `JarvisEvent` variant; no changes to existing variants. After any union extension the WHOLE TREE must typecheck (`pnpm typecheck`) — R1 broke exhaustive switches in client-core and server (task exit criterion).
- **`drive_app` is NOT confirm-gated; `execute_trade` stays confirm-gated.** The narrator **offers, never executes** — persona rule; a `[narration]` turn must not call `drive_app`/`render_panel`.
- **Caps (exact values):** batch 1–8 commands; `DRIVE_STAGGER_MS = 350` (0 under power-saver freeze); `NARRATION_COOLDOWN_MS = 300_000`; `MAX_NARRATIONS_PER_SESSION = 4`.
- **No `Date.now()`/wall-clock inline in machines or detector** — injected scheduler/clock, tick-timestamp windows (deterministic tests doctrine).
- **No `@rtc/*` source imports that violate layering:** `shared` may not import `client-core`; the vocabulary re-declares client-core literals with a client-core-side mirror pin test.
- **Both web clients at parity:** CSS byte-identical, same shared ui-contract specs via the swap-trio, same e2e ride.
- **Motion:** pulse is `transform`/`opacity`-only (`docs/performance.md`), one-shot ≤700ms, fully suppressed under freeze. No `setTimeout` in src (grep gate — and NEVER write the word in comments either; gate matches comment text).
- **Naming:** functions named by effect (`rtc/name-functions-by-effect`); `#/` subpath aliases; Biome `ci` clean; `pnpm lint:eslint:types` clean (run it — plain `lint:eslint` is not enough).
- **Worktree:** all work in `.claude/worktrees/jarvis-p5-spec` (branch `worktree-jarvis-p5-spec`). Every implementer/reviewer MUST `cd` there and verify with `pwd` + `git rev-parse --abbrev-ref HEAD` before any command (subagent-cwd trap).
- **Commit trailer:** every commit ends with the standing `Co-Authored-By: Claude Fable 5` + `Claude-Session` trailer used on this branch (`git log -1` for the exact lines).

---

### Task 1: `DriveCommand` vocabulary (`@rtc/shared`)

**Files:**
- Create: `packages/shared/src/jarvis/driveCommand.ts`
- Create: `packages/shared/src/jarvis/driveCommand.test.ts`
- Modify: `packages/shared/src/index.ts` (export the new module's public names beside the `panelSpec` exports)

**Interfaces:**
- Consumes: nothing new. Pattern source: `packages/shared/src/jarvis/panelSpec.ts` (read it first — const-array-derived unions, hand-rolled walk, `"<field>: <problem>"` errors, schema derived from the same arrays, anti-drift test in `panelSpec.test.ts`).
- Produces (later tasks rely on these exact names):

```ts
export const DRIVE_TABS = ["fx", "credit", "equities", "admin"] as const;
export type DriveTab = (typeof DRIVE_TABS)[number];

export type DriveCommandV1 =
  | { readonly kind: "switchTab"; readonly tab: DriveTab }
  | { readonly kind: "layout"; readonly op: "maximize" | "restore" | "collapse" | "expand";
      readonly tab: DriveTab; readonly panelId: string }
  | { readonly kind: "eqSelect"; readonly symbol: string }
  | { readonly kind: "eqTimeframe"; readonly tf: "1D" | "1W" | "1M" | "3M" }
  | { readonly kind: "eqChartType"; readonly chart: "candles" | "line" | "area" }
  | { readonly kind: "eqIndicator"; readonly id: "sma20" | "ema50"; readonly on: boolean }
  | { readonly kind: "eqPane"; readonly id: "rsi" | "macd"; readonly on: boolean }
  | { readonly kind: "setTheme"; readonly skin: "classic" | "holo" | "holo3d" | "terminal" | "terminal3d" | "neon" }
  | { readonly kind: "setPowerSaver"; readonly level: "off" | "calm" | "freeze" }
  | { readonly kind: "dismissPanel"; readonly panelId: string };

export interface DriveBatchV1 { readonly v: 1; readonly commands: readonly DriveCommandV1[]; } // 1..8

export type DriveBatchParseResult =
  | { readonly ok: true; readonly batch: DriveBatchV1 }
  | { readonly ok: false; readonly error: string }; // "<field>: <problem>"

export function parseDriveBatch(input: unknown): DriveBatchParseResult;
export const DRIVE_COMMAND_JSON_SCHEMA: Record<string, unknown>; // batch form, for the tool input schema
export const MAX_DRIVE_COMMANDS = 8;
```

Every literal union above is a const array first (`DRIVE_LAYOUT_OPS`, `DRIVE_TIMEFRAMES`, `DRIVE_CHART_TYPES`, `DRIVE_INDICATORS`, `DRIVE_PANES`, `DRIVE_SKINS`, `DRIVE_POWER_LEVELS`) so the schema and the parser derive from the same source — the panelSpec anti-drift pattern.

**Steps:**

- [ ] **Step 1: Failing tests.** Cases (mirror `panelSpec.test.ts` style): accepts a full valid batch of each kind; accepts exactly 1 and exactly 8 commands (bounds inclusive — R1 mutation lesson); rejects 0 and 9 with `"commands: must contain 1..8 commands"`; rejects unknown `kind` (`"commands[2].kind: unknown kind \"foo\""`), wrong `v`, non-object command, missing/wrong-typed field per variant (at least one case per variant), extra unknown field on a command is STRIPPED not rejected (normalized output pinned — the R1 `bogus`-field pin); `symbol`/`panelId` accept any non-empty string ≤64 chars (membership is NOT checked here — that's the driver's job); timeframe pin: `DRIVE_TIMEFRAMES` deep-equals `["1D","1W","1M","3M"]` and (import from `@rtc/domain`) matches `CandleTimeframe`'s values; skins/power pins deep-equal the `@rtc/domain` `ThemeSkin`/`PowerSaverLevel` literal sets (write the arrays out; domain exports the types only, so pin against frozen literal arrays and add a `satisfies`-based compile check: `const _pin: readonly ThemeSkin[] = DRIVE_SKINS satisfies readonly ThemeSkin[]`); schema anti-drift: every const array appears verbatim as the matching `enum` in `DRIVE_COMMAND_JSON_SCHEMA`.
- [ ] **Step 2:** `pnpm --filter @rtc/shared test -- driveCommand` → FAIL (module not found).
- [ ] **Step 3:** Implement `driveCommand.ts` following `panelSpec.ts` structurally (walk, per-field errors, normalization that copies only known fields). Export from `packages/shared/src/index.ts`.
- [ ] **Step 4:** Tests pass; `pnpm --filter @rtc/shared build && pnpm --filter @rtc/shared typecheck`.
- [ ] **Step 5:** Commit `feat(shared): DriveCommand v1 vocabulary — closed-vocab drive batch parser + schema`.

### Task 2: Wire — `command` event end to end

**Files:**
- Modify: `packages/shared/src/jarvis/jarvisEvent.ts` (union at lines 22–47)
- Modify: `packages/shared/src/protocol/messages.ts` (SERVER_MSG block near `JARVIS_DELTA`, line ~106)
- Modify: `packages/server/src/effects/jarvis.effects.ts` (`WIRE_TYPE_BY_EVENT`, line 39)
- Modify: every exhaustive switch the new variant breaks (find via `pnpm typecheck` at repo root — R1 broke `client-core` (TS2322 never) and server (TS2741 Record))
- Test: extend `packages/server/src/effects/__tests__/jarvis.effects.test.ts` (or the file that pins `WIRE_TYPE_BY_EVENT` — locate with `grep -rn "JARVIS_PANEL" packages/server/src --include="*.test.ts"`)

**Interfaces:**
- Consumes: `DriveBatchV1` (Task 1).
- Produces: `JarvisEvent` gains `| { readonly type: "command"; readonly batch: DriveBatchV1 }`; `SERVER_MSG.JARVIS_COMMAND = "jarvis.command"`. Wire payload = variant minus `type` plus `turnId` (the documented wire rule in `jarvisEvent.ts`'s header — the generic envelope at `jarvis.effects.ts:321` carries it with zero new plumbing).

**Steps:**

- [ ] **Step 1: Failing test.** In the server effects test: a session emitting `{type:"command", batch}` produces an outbound frame `SERVER_MSG.JARVIS_COMMAND` with `{batch, turnId}`; and a pin that `WIRE_TYPE_BY_EVENT.command === SERVER_MSG.JARVIS_COMMAND`.
- [ ] **Step 2:** Run → FAIL (variant doesn't exist).
- [ ] **Step 3:** Add the variant, the constant, the map row. Run `pnpm typecheck` at the WORKTREE root; fix every switch it reds (add a `case "command"` that no-ops/passes through, matching how each site handled `panel` in PR #488 — `git log --oneline --all -S '"panel"' -- packages/client-core` shows the sites).
- [ ] **Step 4:** Server tests pass; **whole tree** `pnpm typecheck` green (exit criterion).
- [ ] **Step 5:** Commit `feat(wire): JARVIS_COMMAND — additive command JarvisEvent variant`.

### Task 3: `drive_app` server tool + persona

**Files:**
- Create: `packages/server/src/agent/driveAppTool.ts`
- Create: `packages/server/src/agent/driveAppTool.test.ts`
- Modify: `packages/server/src/agent/AnthropicAgentSession.ts` (compose beside `renderPanelTool`, lines ~376–402: `buildDriveAppTool({ emitDrive: (batch) => this.emitCommandEvent(batch) })`; add `emitCommandEvent` mirroring `emitPanelEvent`)
- Modify: `packages/server/src/agent/jarvisPersona.ts` (drive section + few-shots)
- Modify: the persona conformance pin test (locate: `grep -rn "render_panel (?:again )?with" packages/server/src`)

**Interfaces:**
- Consumes: `parseDriveBatch`, `DRIVE_COMMAND_JSON_SCHEMA`, `MAX_DRIVE_COMMANDS` (Task 1); the `panel` emit path (Task 2).
- Produces: `buildDriveAppTool(deps: { emitDrive(batch: DriveBatchV1): void }): <same betaTool shape as buildRenderPanelTool>` with `RENDER := DRIVE_APP_TOOL_NAME = "drive_app"`.

**Steps:**

- [ ] **Step 1: Failing tests** (mirror `renderPanelTool.test.ts`): valid batch → `emitDrive` called once with the NORMALIZED batch, handler returns a string containing `applied: N`; invalid batch (9 commands / unknown kind) → `emitDrive` NOT called, return string contains the `"<field>: <problem>"` error; mixed validity is impossible by design (parse is all-or-nothing at the tool gate — assert the whole batch rejects). **Remember the R1 SDK finding:** `betaTool.parse` is IDENTITY — our `parseDriveBatch` call inside the handler is the only gate; test it as such.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement tool + session composition + persona. Persona drive section (verbatim copy for the implementer): tool purpose, when to drive (only on explicit user request or accepted offer), never during `[narration]` turns, and TWO few-shots using the REAL envelope: `call drive_app with {commands: [{kind: "switchTab", tab: "equities"}, {kind: "layout", op: "maximize", tab: "equities", panelId: "eq-chart"}]}`. Extend the conformance pin regex to also require `/drive_app with \{commands: \[\{kind: /` on both drive Example lines (R1 envelope-drift lesson).
- [ ] **Step 4:** `pnpm --filter @rtc/server test` green; typecheck green.
- [ ] **Step 5:** Commit `feat(server): drive_app WS-surface tool + persona drive section`.

### Task 4: Scripted brain — `setupWorkspace` + `narration` intents

**Files:**
- Modify: `packages/shared/src/jarvis/jarvisIntent.ts` (cascade — read the priority-order warning at the top; `[narration]` matches by `^\[narration\]` ANCHOR, so it goes FIRST and is collision-proof; `setupWorkspace` matches `/(set ?up|morning|vol(atility)?) .*workspace/i` and must sit ABOVE the movers rule, the R1 "volatil" collision site)
- Modify: `packages/shared/src/jarvis/ScriptedJarvisEngine.ts` (two new cases beside `showPanel`/`restylePanel` at lines ~324–327)
- Test: `packages/shared/src/jarvis/jarvisIntent.test.ts`, `ScriptedJarvisEngine.test.ts`

**Interfaces:**
- Consumes: `DriveBatchV1` (Task 1), the `command` event variant (Task 2).
- Produces: scripted `setupWorkspace` turn emits deltas + ONE `{type:"command", batch: SCRIPTED_VOL_WORKSPACE_BATCH}` + reuses the existing showPanel emission (the canned GBP-vol panel, `panel-scripted-1`) + `done`. Exact canned batch:

```ts
export const SCRIPTED_VOL_WORKSPACE_BATCH: DriveBatchV1 = { v: 1, commands: [
  { kind: "switchTab", tab: "equities" },
  { kind: "layout", op: "maximize", tab: "equities", panelId: "eq-chart" },
  { kind: "eqTimeframe", tf: "1D" },
  { kind: "eqIndicator", id: "ema50", on: true },
  { kind: "eqPane", id: "rsi", on: true },
]};
```

`narration` turn (input starts `[narration]`) emits ONLY deltas + `done` — canned copy quoting the symbol parsed from the prompt, ending with the offer sentence `"Shall I set up the vol workspace?"` — NO command/panel events (offers-never-executes, pinned).

**Steps:** failing intent-priority tests (incl. `"[narration] EURUSD volatility…"` resolving to `narration` NOT `movers`/`setupWorkspace`; `"set up my morning workspace"` → `setupWorkspace`) → red → implement → green → commit `feat(shared): scripted setupWorkspace + narration intents (zero-token drive path)`.

### Task 5: Client parse seam + `WorkspaceNavMachine`

**Files:**
- Modify: `packages/client-core/src/adapters/WsJarvisAdapter.ts` (listener beside `SERVER_MSG.JARVIS_PANEL` at line ~200: on `SERVER_MSG.JARVIS_COMMAND`, `parseDriveBatch(payload.batch)`; ok → re-emit `{type:"command", batch: normalized}` on the turn's event stream; not ok → drop silently — pinned)
- Create: `packages/client-core/src/presenters/WorkspaceNavMachine.ts` + test
- Modify: `packages/client-core/src/composition.ts` + `packages/client-core/src/presenters/machine.ts` (machines surface gains `workspaceNav`)
- Modify: sim-mode Jarvis adapter (the scripted engine consumer — locate with `grep -rln "ScriptedJarvisEngine" packages/client-core/src/adapters`) so scripted `command` events flow in sim mode too

**Interfaces:**
- Produces:

```ts
export interface WorkspaceNavState { readonly activeTab: WorkspaceTab; }
export interface WorkspaceNavIntents { switchTab(tab: WorkspaceTab): void; }
// machine.ts surface: workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;  (singleton)
```

Initial state `{ activeTab: "fx" }`. Pattern: the smallest existing singleton machine (`EqWorkspaceMachine`'s `state`/`Subject`/`scan` shape, minus deps).

**Steps:** failing tests (adapter: valid frame re-emitted normalized, invalid frame dropped and stream stays alive for later frames; machine: initial `"fx"`, `switchTab` folds, repeated same-tab is a no-op emission-wise via `distinctUntilChanged`) → red → implement + wire composition singleton → green + tree typecheck → commit `feat(client-core): JARVIS_COMMAND parse seam + WorkspaceNavMachine promotion (state)`.

### Task 6: `JarvisDriverMachine`

**Files:**
- Create: `packages/client-core/src/presenters/JarvisDriverMachine.ts` + `.test.ts`
- Modify: `packages/client-core/src/composition.ts` (compose beside `jarvisPanels` at lines ~414–447, SAME `catchError(() => EMPTY)` guarded source, warm `state$.subscribe()` — copy the JarvisPanelsMachine wiring comments' reasoning)

**Interfaces:**
- Consumes: `events$: Observable<JarvisEvent>` (guarded), handles: `workspaceNav` (T5), `layout: (tab: WorkspaceTab) => Machine<LayoutState, LayoutIntents>`, `eqWorkspace: Machine<EqWorkspaceState, EqWorkspaceIntents>`, `setThemeSkin(skin: ThemeSkin): void`, `setPowerSaver(level: PowerSaverLevel): void` (thin closures over the two preference presenters — composition supplies), `dismissPanel(panelId: string): void` (JarvisPanelsMachineHandle), `knownLayoutPanelIds: (tab: WorkspaceTab) => readonly string[]`, `knownSymbols$: Observable<readonly string[]>`, `powerSaverLevel$: Observable<PowerSaverLevel>` (freeze collapse), `scheduler?: SchedulerLike` (tests inject TestScheduler).
- Produces:

```ts
export type DriveOutcome = { readonly command: DriveCommandV1;
  readonly status: "applied" | "skipped"; readonly reason?: string };
export interface JarvisDriverState { readonly lastBatch: readonly DriveOutcome[]; }
export interface JarvisDriverMachineHandle {
  readonly state$: StateObservable<JarvisDriverState>;
}
export const DRIVE_STAGGER_MS = 350;
export function createJarvisDriverMachine(deps: JarvisDriverDeps): JarvisDriverMachineHandle;
```

**Behaviour to pin in marble tests:** batch commands apply in order, `DRIVE_STAGGER_MS` apart on the injected scheduler; stagger is 0 when `powerSaverLevel$` last emitted `"freeze"`; unknown `panelId`/`symbol` → `skipped` with reason, subsequent commands still apply; `eqIndicator`/`eqPane` with `on` already satisfied → `skipped` reason `"already set"` and the toggle intent is NOT called (read `eqWorkspace.state$` current value); a second batch arriving mid-stagger queues after the first (`concatMap`); nonsense never throws (total interpreter); layout op targets the machine for the command's OWN `tab` field regardless of `workspaceNav` state; composition survives an exploding source (the R1 exploding-JarvisPort createApp test pattern — extend that test file to also assert the driver machine).

**Steps:** failing marbles → red → implement (single `concatMap` over command events, inner `concatMap(cmd => timer(stagger, scheduler).pipe(map(() => apply(cmd))))`, `scan` into `lastBatch`) → green → compose → tree typecheck → commit `feat(client-core): JarvisDriverMachine — total DriveCommand interpreter with choreography stagger`.

### Task 7: `detectAnomalies` (`@rtc/domain`)

**Files:**
- Create: `packages/domain/src/jarvis/anomalyDetector.ts` + `.test.ts`
- Modify: `packages/domain/src/index.ts` (export)

**Interfaces:**
- Consumes: the domain `PriceTick` type (locate: `grep -rn "interface PriceTick\|type PriceTick" packages/domain/src` — use its real field names for mid/bid/ask/timestamp).
- Produces:

```ts
export interface AnomalyDetectorConfig {
  readonly windowSize: number;      // ticks per rolling window, default 120
  readonly spreadSigma: number;     // default 3
  readonly volSigma: number;        // default 3
  readonly minWindowFill: number;   // ticks before any emission, default 60
}
export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectorConfig;
export type AnomalyEvent =
  | { readonly kind: "spreadWidening"; readonly symbol: string; readonly sigma: number }
  | { readonly kind: "volSpike"; readonly symbol: string; readonly sigma: number };
export function detectAnomalies(ticks$: Observable<PriceTick>,
  config?: Partial<AnomalyDetectorConfig>): Observable<AnomalyEvent>;
```

**Behaviour to pin:** per-symbol independent windows (interleaved two-symbol marble); no emission before `minWindowFill`; **edge-triggered** — crossing emits once, staying above emits nothing, re-crossing after dropping below re-emits; returns-σ math on mid prices; spread = ask − bid vs its own rolling mean/σ; pure `scan`, no wall clock, no I/O; constant series (σ=0) emits nothing (guard division).

**Steps:** failing marbles → red → implement → green → commit `feat(domain): edge-triggered anomaly detector (spread 3σ + vol spike)`.

### Task 7b: `PricingSimulator` anomaly episodes (added 2026-08-05 after T7's review)

**Why (review finding, verified by measurement):** the simulator's spread is bit-identical forever (`halfSpread` set once in `initPair`) and its uniform step caps return z-scores at √3≈1.73 — so neither detector channel can EVER fire against the repo's only `PriceTick` stream (0 crossings in 2M ticks), in sim mode or against the deployed server. The approved on-by-default narrator requires a source that can rarely produce anomalies.

**Files:**
- Modify: `packages/domain/src/simulators/PricingSimulator.ts`
- Test: its existing test file + new episode-logic tests

**Design (keep it small and bounded):**
- Per-pair episode state machine, pure and separately unit-testable: in steady state, each tick has a small probability of starting an episode; an episode lasts a bounded tick count then decays back.
- Two episode kinds: **spread widening** (halfSpread × a factor ramping to 2–4× and back) and **vol burst** (step drawn from a wider distribution — e.g. the existing uniform step × a 4–8× factor for the episode's duration, occasionally signed-persistent so returns actually spike).
- Frequency tuned to the narrator's product cadence: expected episode interval per symbol in the minutes range at the sim's 150–1000 ms tick cadence (e.g. start probability ≈ 1/1500 per tick, duration 20–60 ticks). Constants named and documented; the narrator's own 5-min cooldown + 4/session cap remain the spam bound.
- Determinism: extract the episode-advance logic as a pure function `advanceEpisode(state, random: () => number)` taking the RNG as a parameter; unit tests drive it with scripted sequences (forced start, ramp shape, decay, bounds). A statistical test may assert only STRUCTURE (e.g. with a forced episode, `ask − bid` changes over the episode; returns during a burst exceed the steady-state step bound) — no flaky probability assertions.
- Guard the blast radius: steady-state behavior (no episode) must be byte-compatible with today's output for the same RNG sequence — pin with a test comparing tick streams with episode-start probability forced to 0.

**Interfaces:** no public API change; `getPriceUpdates` signature unchanged.

**Steps:** failing episode-logic tests → red → implement → green (domain suite + build + typecheck + biome) → commit `feat(domain): rare pricing anomaly episodes — the narrator's trigger source`.

### Task 8: `JarvisNarrator` preference + `JarvisMachine.narrate`

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts` (+test): `export type JarvisNarratorPreference = "on" | "off";` default `"on"`, storage key alongside the existing `rt-*` keys (follow `JarvisBrain`'s rows exactly)
- Modify: the 4 storage adapters + preferences contract test + `JarvisPreferencesPresenter` + both bindings + fixtures — the KNOWN ~10-site preference blast radius; find every site with `grep -rln "JarvisBrain" packages/ | grep -v test` and mirror each
- Modify: `packages/client-core/src/presenters/JarvisMachine.ts` (+test)

**Interfaces:**
- Produces: `JarvisIntents` gains `narrate(prompt: string): void`. Transcript entry type gains `readonly origin?: "narrator"` on the user-side entry of a narrate turn (the entry text is the prompt WITHOUT the `[narration] ` prefix — display copy; the prefix goes only to `port.ask`). `JarvisState` gains `readonly unreadNarration: boolean` — set when a narrate turn completes while `open` is false; cleared by `open()`.

**Behaviour to pin:** `narrate` enters the SAME `concatMap` turn queue as `send` (line ~395; a narrate during a running send queues behind it); `narrate` while unavailable is the same silent no-op as `send`; usage metering untouched (it keys off `port.ask`, which narrate uses).

**Steps:** failing tests (preference default/persistence contract; machine marbles: origin flag, prefix stripping, unread flag set-when-closed / not-set-when-open / cleared-on-open, queue interleave) → red → implement → green + tree typecheck → commit `feat(client-core,domain): JarvisNarrator preference + JarvisMachine.narrate unsolicited turns`.

### Task 9: `NarratorMachine` + dev threshold seam

**Files:**
- Create: `packages/client-core/src/presenters/NarratorMachine.ts` + `.test.ts`
- Modify: `packages/client-core/src/composition.ts` (singleton, warm sub; deps: the same `PricingPort` used by `composePanelStream` (`PanelStreamDeps.pricing`), `narrate: jarvis intents.narrate`, `preference$: Observable<JarvisNarratorPreference>`, `scheduler?`, `config?: Partial<AnomalyDetectorConfig>`)
- Modify: `packages/client-react/src/app/buildBrowserPorts.ts` AND `packages/client-solid/src/app/buildBrowserPorts.ts`: when `import.meta.env.DEV && new URLSearchParams(location.search).get("narratorThresholds") === "test"`, pass `{ windowSize: 8, minWindowFill: 4, spreadSigma: 0.1, volSigma: 0.1 }` as the narrator config (dev-only — `import.meta.env.DEV` is compile-time false in prod builds, so the branch is eliminated)

**Interfaces:**
- Produces:

```ts
export const NARRATION_COOLDOWN_MS = 300_000;
export const MAX_NARRATIONS_PER_SESSION = 4;
export function createNarratorMachine(deps: NarratorDeps): { readonly stop: () => void };
```

Prompt format (exact, pinned by test): `[narration] ${symbol} ${kind === "spreadWidening" ? "spread widened" : "moved"} ${sigma.toFixed(1)}σ over the last window.` (T7 review ruling: the vol channel detects a large single-tick MOVE, not a rise in σ-of-σ — copy must say "moved", never "volatility jumped".)

**Behaviour to pin (marbles):** first surviving anomaly → one `narrate` call; second anomaly inside `NARRATION_COOLDOWN_MS` (virtual time) → dropped; after cooldown → passes; 5th narration in a session → dropped forever (`MAX_NARRATIONS_PER_SESSION`); `preference$` = `"off"` → dropped, flipping to `"on"` live re-enables WITHOUT re-composition (stays subscribed); detector errors don't kill the machine (`catchError` → EMPTY on the tick source).

**Steps:** failing marbles → red → implement (`withLatestFrom(preference$)`, `throttleTime`-equivalent via scan on scheduler `now()`, take-style counter) → green → wire composition + both `buildBrowserPorts` → commit `feat(client-core): NarratorMachine — capped client-side proactive narration`.

### Task 10: React UI — nav rewire, driven pulse, narrator surfaces

**Files:**
- Modify: `packages/client-react/src/ui/App.tsx:22-34` (delete the `useState`; `const nav = useMachine(vm.machines.workspaceNav)` via the existing `useMachine` from `@rtc/react-bindings`; pass `nav.state.activeTab` / `nav.intents.switchTab`; `key={...}` unchanged)
- Create: `packages/client-react/src/ui/shell/jarvis/DrivenPulse.module.css` + a small hook-free cue component or attribute wiring in the driven regions (HeaderChrome nav rail + WorkspaceEngine wrapper): subscribe `jarvisDriver.state$` via `useViewModel`, on a new applied outcome set `data-jarvis-driven` for one animation cycle (CSS `animation` 700ms, `opacity`/`transform` only, `animation: none` under the freeze catch-all)
- Modify: chat timeline — each applied command renders the existing toolEvent row style with text `drive: <kind>` (reuse the `toolEvent` renderer; the driver's outcomes feed it via the presenter surface)
- Modify: narrator transcript styling (entry with `origin: "narrator"` gets a `data-origin="narrator"` class — accent border, "JARVIS initiated" affordance) + orb flare (the orb component reads `unreadNarration` from `JarvisState`, reuses its existing flare/pulse class)
- Modify: Preferences modal — `Narrator` on/off row (copy the JarvisBrain picker row's structure, binding to the new preference presenter surface)
- Tests: component-level via the contract tier (Task 12); this task keeps `pnpm --filter @rtc/client-react test` green and adds nothing React-test-only

**Steps:** implement → `pnpm --filter @rtc/client-react test && pnpm typecheck && pnpm lint:eslint:types` → commit `feat(client-react): machine-backed nav + driven pulse + narrator surfaces`.

### Task 11: Solid mirror

**Files:** the exact Solid counterparts of every Task 10 file (`packages/client-solid/src/ui/...`). CSS **byte-identical** (`diff` the two `.module.css` files in the task's self-review — the parity doctrine); `useMachine`/`useViewModel` from `@rtc/solid-bindings`; Solid reactivity idioms (no destructuring of stores in render).

**Steps:** implement → `pnpm --filter @rtc/client-solid test` + typecheck + `cmp` the CSS files → commit `feat(client-solid): parity mirror of nav/pulse/narrator surfaces`.

### Task 12: Shared ui-contract specs

**Files:**
- Create: `packages/ui-contract/src/specs/shell/jarvis/JarvisDriver.contract.spec.ts` (+ page object + world entries, mirroring `JarvisPanelLayer.contract.spec.ts`'s trio structure)
- Modify: the existing nav/header contract spec (tab click still switches workspaces — now via the machine)

**Specs (both frameworks via the swap-trio):**
1. clicking a nav tab switches the workspace (regression on the promotion)
2. a scripted `setupWorkspace` chat turn switches to equities and maximizes eq-chart (drive the world's scripted engine; assert via testids)
3. driven region carries `data-jarvis-driven` after a drive, and does NOT under freeze
4. timeline shows `drive: switchTab` rows for applied commands
5. skipped command (unknown panelId injected via a fixture batch) renders no pulse and the rest still applies
6. narrator: injecting a narrate turn (world helper calling `intents.narrate`) renders the narrator-origin styling; orb shows the unread flare when closed
7. Preferences narrator row toggles the preference (persisted via the world's storage fake)

**Steps:** specs red where behaviour is new → implement gaps → BOTH `pnpm --filter @rtc/client-react test:ui:contract` and `--filter @rtc/client-solid` green → **both coverage gates** (`test:ui:contract:coverage`) still ≥95% (check PER-FILE output for the new files, not just the aggregate) → commit `test(ui-contract): driver + narrator shared specs`.

### Task 13: e2e rides + live smoke turn

**Files:**
- Modify: `tests/browser/scenarios/jarvis.ts` (+ the solid run config if separate): the flagship ride — launch with `?narratorThresholds=test`; await the narration entry (orb flare if panel closed → open); reply `set up the vol workspace`; assert: equities tab active, `eq-chart` maximized (testid/layout state attr), `ema50`/`rsi` on, `panel-scripted-1` present, timeline `drive:` rows; a second `narratorThresholds`-triggered narration respects the cooldown (assert NO second narration entry within the ride)
- Modify: `tests/scripts/jarvis-live-smoke.ts`: one drive turn — `"switch to equities and maximize the chart"` → assert a `jarvis.command` frame arrives whose batch `parseDriveBatch`-round-trips and contains a `switchTab` command. Keyless-refusing as the file already does; NO CI wiring.

**Steps:** run `pnpm test:e2e` (both clients' suites via run-all) green → commit `test(e2e): flagship drive+narrator ride + live-smoke drive turn`.

### Task 14: Docs — showcase page, §18.17, STATUS

**Files:**
- Create: `docs/showcase/machine-boundary-agent-reach.html` — self-contained (inline CSS, no external assets, no JS needed), gh-pages-published via `publish-site.yml`. Content per spec §4.1: the claim; the natural experiment (agent reach = machine boundary; the two `useState` pockets — `App.tsx` promoted this round as the toll, `FxViewProvider` kept as the still-unreachable exhibit); side-by-side code blocks (before: `useState`, unreachable from composition; after: `WorkspaceNavMachine`, two callers one intent); the toll receipt (one machine + two rewired components); the shipped-PR receipt table (P1 #405, P3 #444, P4 #453, governance #472, genUI #488, P5 this PR). Add an index link in `docs/showcase/README.md`/`index.html` following the existing entries.
- Modify: `docs/architecture/18-jarvis-ai-agent-surface.md` — §18.17 (DriveCommand vocabulary, driver/nav/narrator machines, offers-never-executes, caps, the promotion story), cross-link the showcase page.
- Modify: `docs/STATUS.md` per the tracking-workstream-status skill (this round in 🟡 while in flight → delete on merge; keep the deferred FX-pocket promotion as a ⚪ line), `docs/running-real-jarvis.md` (drive turn in the smoke, narrator token note: ≤4 narrations/session on the resolved brain).
- [ ] `pnpm check:doc-links` green → commit `docs: machine-boundary showcase + §18.17 + status`.

---

## Execution notes (controller)

- Parallelism: T1 alone → then T2 → then {T3, T4, T5} disjoint → T6 (needs T5) ∥ {T7, T8} → T9 (needs T7+T8) → {T10, T11} after T6+T9 (T11 after T10 for CSS byte-copy) → T12 → T13 → T14 anytime after T6 (content cites earlier tasks).
- Gauntlet: `/rtc:gauntlet` per phase, `full` before the PR; goldens: none planned — if the contract tier reveals a new steady visual state, use the 5-edit scenario recipe + regen both sets instead of ad-hoc.
- Ship per shipping-repo-changes: PR from `worktree-jarvis-p5-spec` (spec+plan already on it), CI loop, Rule-3 triage, `--merge`.
