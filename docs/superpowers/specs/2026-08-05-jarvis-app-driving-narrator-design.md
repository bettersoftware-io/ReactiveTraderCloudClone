# Jarvis P5 — app-driving + proactive narrator (design spec)

**Date:** 2026-08-05
**Status:** Approved design, pre-implementation-plan
**Roadmap position:** §10 Tier-1 item 2 (**Jarvis drives the app**) + §10 Tier-3 item 9
(**proactive narrator, deterministic triggers**) from
[2026-07-12-jarvis-ai-assistant-design.md](2026-07-12-jarvis-ai-assistant-design.md),
executed as one round because they compose into a single flagship demo.
**Builds on:** generative UI round 1
([2026-08-04-jarvis-generative-ui-round-1-design.md](2026-08-04-jarvis-generative-ui-round-1-design.md),
PR #488) — the `render_panel` WS-surface-tool precedent, the closed-vocabulary /
validated-both-ends doctrine, and `JarvisPanelsMachine`.

## 0. The flagship demo

A volatility spike fires a deterministic domain-side detector → Jarvis speaks up
unprompted (orb flares; narration lands in the chat timeline) → *"EUR/USD volatility
just jumped 3.4σ. Want me to set up the vol workspace?"* → user: *"yes"* → the app
switches to Equities, the chart maximizes, indicators flip on, and a live-bound
GBP-vol panel spawns — all narrated, all through tools, all replayable with **zero
tokens** via the scripted brain.

## 1. Locked decisions (with user, 2026-08-05)

| # | Decision | Choice |
|---|---|---|
| 1 | Drive-verb scope | **Core set**: workspace-tab switch, layout ops, equities-workspace ops, panel dismiss, theme/power-saver preferences. FX sub-tabs + quick-filter promotion deferred. |
| 2 | Trust model | **Immediate + visible cue.** Commands apply instantly with a per-command timeline trace and a driven-region pulse. `execute_trade` stays confirm-gated; drive commands are reversible UI mutations. |
| 3 | Narrator policy | **On by default, capped.** Client-side cooldown ≥5 min between narrations, max 4 per session; `JarvisNarrator` domain preference (on/off) to disable. Uses the resolved brain (Haiku default). |
| 4 | Thesis doc | **Showcase page + architecture section.** `docs/showcase/machine-boundary-agent-reach.html` (gh-pages, presentation-ready) + §18.17 in the architecture doc. |
| 5 | Driver shape (design review) | Closed `DriveCommand` vocabulary + typed dispatcher machine — NOT a reflective intent registry. |
| 6 | Narrator placement (design review) | **Client-side detection** issuing normal turns through the existing pipeline — zero new wire types, one code path for sim and ws-real. |
| 7 | Narrator agency (design review) | The narrator **offers, never executes**. A narration turn may suggest a workspace action; only the user's reply (a new turn) can drive. |

## 2. Feature 1 — app-driving (`drive_app`)

### 2.1 `DriveCommand` v1 — the closed vocabulary (`@rtc/shared`)

New file `packages/shared/src/jarvis/driveCommand.ts`, sibling of `panelSpec.ts`
and following its doctrine exactly: hand-rolled validator with `"<field>:
<problem>"` errors, `DRIVE_COMMAND_JSON_SCHEMA` derived from the same const
arrays (anti-drift pin test), validated **both** ends (server tool gate + client
parse seam).

```ts
export type DriveCommandV1 =
  | { readonly kind: "switchTab"; readonly tab: "fx" | "credit" | "equities" | "admin" }
  | { readonly kind: "layout";
      readonly op: "maximize" | "restore" | "collapse" | "expand";
      readonly tab: "fx" | "credit" | "equities" | "admin";
      readonly panelId: string }            // e.g. "fx-rates", "eq-chart"; membership checked client-side
  | { readonly kind: "eqSelect"; readonly symbol: string }
  | { readonly kind: "eqTimeframe"; readonly tf: "1D" | "1W" | "1M" | "3M" }
  | { readonly kind: "eqChartType"; readonly chart: "candles" | "line" | "area" }
  | { readonly kind: "eqIndicator"; readonly id: "sma20" | "ema50"; readonly on: boolean }
  | { readonly kind: "eqPane"; readonly id: "rsi" | "macd"; readonly on: boolean }
  | { readonly kind: "setTheme"; readonly skin:
      "classic" | "holo" | "holo3d" | "terminal" | "terminal3d" | "neon" }
  | { readonly kind: "setPowerSaver"; readonly level: "off" | "calm" | "freeze" }
  | { readonly kind: "dismissPanel"; readonly panelId: string };

export interface DriveBatchV1 {
  readonly v: 1;
  readonly commands: readonly DriveCommandV1[]; // 1..8
}
```

Notes pinned by review of the real code:

- The literal unions mirror `WorkspaceTab` (`#/layout/defaultLayoutPort`),
  `CandleTimeframe` (`@rtc/domain`), `EqChartType` / `EqIndicatorId` / `EqPaneId`
  (`EqWorkspaceMachine`), `ThemeSkin` and `PowerSaverLevel`
  (`@rtc/domain` preferences). `@rtc/shared` may not import `client-core`, so the
  vocabulary re-declares the literals; the anti-drift pin tests assert equality
  against the source unions where importable (`domain`) and against frozen local
  copies where not (`client-core` unions — the client-core side gets the mirror
  pin test, since `client-core` *does* depend on `shared`).
- `eqIndicator` / `eqPane` use **setter semantics** (`on: boolean`) even though the
  machine exposes toggles — the driver reads current machine state and toggles
  only when it differs, making replayed/duplicated commands idempotent.
- **Panel spawning is NOT in the vocabulary.** `render_panel` already owns
  creation/morph; `drive_app` only gets `dismissPanel`. One path per capability.
- `layout.panelId` and `eqSelect.symbol` are validated for shape server-side and
  for **membership** client-side (against the layout tree / known instruments),
  the same split as PanelSpec's `knownSymbols` skip-mode: the server doesn't
  know the client's layout, so unknown ids are skipped (rejected per-command)
  at the driver, never fatally.

### 2.2 `drive_app` — the WS-surface tool (server)

`packages/server/src/agent/driveAppTool.ts`, sibling of `renderPanelTool.ts`,
composed into `AnthropicAgentSession` only — **not** in `@rtc/agent-tools`
(client UI state is meaningless over `/mcp`; same reasoning as `get_app_context`
and `render_panel`). Not confirm-gated (locked decision 2).

- Input schema: `DRIVE_COMMAND_JSON_SCHEMA` (the batch form, 1–8 commands).
- The tool validates with `parseDriveBatch`, then calls injected
  `emitDrive(batch)` (mirrors `emitPanel`) and returns a per-command
  `accepted` / `rejected: "<field>: <problem>"` summary string so the model can
  self-correct within the turn.
- Persona (`jarvisPersona.ts`) gains a drive section with envelope-conformant
  few-shots (the R1 lesson — examples MUST show the real
  `call drive_app with {commands: [...]}` envelope; extend the existing
  conformance pin test to cover them).
- The scripted brain (`ScriptedJarvisEngine`) gains a `setupWorkspace` intent
  ("morning workspace", "vol workspace", "set up …") emitting a canned command
  batch + narration deltas, and keeps `showPanel` composition (the canned
  vol-workspace batch ends by spawning the R1 GBP-vol panel). Zero-token
  demo/CI path.

### 2.3 Wire — one additive event

- `JarvisEvent` (shared) gains
  `{ readonly type: "command"; readonly batch: DriveBatchV1 }`.
- `packages/shared/src/protocol/messages.ts` gains `JARVIS_COMMAND:
  "jarvis.command"`; the server's `WIRE_TYPE_BY_EVENT` map gains the row.
  Mechanical mirror of R1's `panel` event; the generic envelope carries it.
- `WsJarvisAdapter` (client-core) listens for `JARVIS_COMMAND`, re-validates
  with `parseDriveBatch` (shape only — membership stays in the driver), and
  re-emits on `events$`. An invalid batch is **dropped silently** (no sentinel
  needed — unlike panels there is nothing to render, and the server already
  validated; a client-side parse failure means version skew, which the drop
  degrades gracefully). Pinned by an adapter test.

### 2.4 `WorkspaceNavMachine` — the promotion (client-core)

The top-level workspace tab currently lives as `useState<WorkspaceTab>("fx")`
in `client-react`'s `App.tsx:22` (Solid equivalent in `client-solid`) — the
one piece of drivable UI state outside the machine boundary, and therefore
unreachable by the agent. Promote it:

```ts
// packages/client-core/src/presenters/WorkspaceNavMachine.ts
export interface WorkspaceNavState { readonly activeTab: WorkspaceTab; }
export interface WorkspaceNavIntents { switchTab(tab: WorkspaceTab): void; }
```

- Composition-root **singleton** (the `EqWorkspaceMachine` precedent), exposed
  on the machines surface as `workspaceNav`.
- Both web clients rewire: `App` consumes it via `useMachine`
  (`react-bindings` / `solid-bindings`); `HeaderChrome`'s `onTabChange` slot
  now receives `intents.switchTab`. The `key={activeTab}` remount of
  `WorkspaceEngine` is unchanged — it reads machine state instead of local
  state. UI behaviour is pixel-identical; only ownership moves.
- This is the round's **only** state promotion (locked decision 1).

### 2.5 `JarvisDriverMachine` — the client interpreter (client-core)

`packages/client-core/src/presenters/JarvisDriverMachine.ts`, the mirror of
`JarvisPanelsMachine`: a session-lifetime fold over `jarvis.events$`'s
`"command"` events, created once at composition with a warm subscription and
the same `catchError(() => EMPTY)` source guard.

- **Injected handles** (composition supplies): `workspaceNav`,
  `layout(tab)` (the per-tab machine factory), `eqWorkspace`,
  `themeSkinPreference`, `powerSaver`, `JarvisPanelsMachineHandle.dismissPanel`.
- **Total interpreter:** commands execute strictly in batch order; a command
  that fails membership (unknown `panelId`, unknown `symbol`) or is a no-op
  (setter already satisfied) is skipped and recorded; the machine never
  throws (the `composePanelStream` totality doctrine).
- **Choreography:** commands within a batch execute with a fixed stagger
  (`DRIVE_STAGGER_MS = 350`) so the workspace visibly rearranges step by step.
  Under power-saver **freeze** the stagger collapses to 0 (instant, motion-free)
  — gate via the existing power-saver signal, not a new mechanism.
- **`switchTab` ordering:** a batch that targets equities state after
  `switchTab: "equities"` works because `EqWorkspaceMachine` is a singleton —
  its state updates regardless of which tab is mounted. Layout ops target the
  per-tab layout machine by the command's own `tab` field, not the active tab.
- **State:** `{ lastBatch: readonly DriveOutcome[] }` where `DriveOutcome =
  { command, status: "applied" | "skipped", reason? }` — consumed by the UI
  cue layer and by tests.
- Rejected alternative (recorded): a reflective intent registry where machines
  self-register addressable intents by name. Weaker typing, action-at-a-
  distance, and the closed-vocab + typed-dispatcher pattern is already proven
  twice (PanelSpec, and the tool registry itself).

### 2.6 Visible cue (both web clients)

- Each applied command appends a `toolEvent`-style entry to the chat timeline
  (the existing `toolEvent` rendering path; no new timeline UI).
- The driven region pulses once: the driver's `lastBatch` feeds a
  `data-jarvis-driven` attribute flash on the affected panel/tab (one-shot,
  ~700 ms, `transform`/`opacity`-only per `docs/performance.md`, fully
  suppressed under freeze). CSS byte-identical across the two clients per the
  parity doctrine.

## 3. Feature 2 — proactive narrator

### 3.1 Detector — pure math in `@rtc/domain`

`packages/domain/src/jarvis/anomalyDetector.ts` (new): a pure, rxjs-only
rolling-window fold over price ticks.

```ts
export type AnomalyEvent =
  | { readonly kind: "spreadWidening"; readonly symbol: string;
      readonly sigma: number }               // spread ≥ 3σ vs rolling mean
  | { readonly kind: "volSpike"; readonly symbol: string;
      readonly sigma: number };              // rolling σ of returns crossing threshold

export function detectAnomalies(
  ticks$: Observable<PriceTick>,
  config?: AnomalyDetectorConfig,           // window sizes + thresholds, defaulted
): Observable<AnomalyEvent>;
```

- Two triggers v1 (spread 3σ, vol spike), both marble-testable, no I/O, no
  wall-clock reads (window by tick count / tick timestamps, the
  deterministic-tests doctrine).
- Per-symbol rolling state inside a `scan`; emits only on threshold **crossing**
  (edge-triggered, not level-triggered) so a persistently wide spread fires
  once, not per tick.

### 3.2 `NarratorMachine` (client-core) — client-side, through the normal pipeline

`packages/client-core/src/presenters/NarratorMachine.ts`, composition
singleton with a warm subscription:

- Subscribes `detectAnomalies` to the existing `PricingPort` tick stream (the
  same port `composePanelStream` consumes) — **one code path for sim and
  ws-real**, since the port is the seam.
- On an `AnomalyEvent` that survives the caps, dispatches a new
  `JarvisMachine` intent `narrate(prompt)` with a synthetic prompt:
  `"[narration] EUR/USD spread widened 3.4σ over the last window."`.
- **Caps (client-side constants):** `NARRATION_COOLDOWN_MS = 300_000` (≥5 min
  between narrations), `MAX_NARRATIONS_PER_SESSION = 4`. Cooldown measured
  against the injected clock/scheduler (testable), never `Date.now()` inline.
- **Preference gate:** reads the new `JarvisNarrator` preference (below);
  off → the machine stays subscribed but drops all events (cheap, and the
  toggle takes effect live without re-composition).

### 3.3 `JarvisMachine.narrate` — the unsolicited turn

`JarvisIntents` gains `narrate(prompt: string): void`:

- Behaves like `send()` (same `concatMap` turn queue, same `port.ask()` call
  with the resolved brain/effort) with two differences: the transcript entry
  is flagged `origin: "narrator"` (UI styles it as Jarvis-initiated; the user
  bubble shows the anomaly headline, not a fake user message), and if the
  panel is **closed** when the turn completes, the machine raises an
  `unread` flag that the orb renders as a flare until opened.
- **Offers, never executes** (locked decision 7): enforced in the persona —
  the narration section instructs the model to describe and *suggest* (it MAY
  NOT call `drive_app` or `render_panel` during a `[narration]` turn); the
  drive/panel tools remain available only on subsequent user-initiated turns.
  The scripted brain's narration intent likewise emits deltas only. This is a
  persona-level rule, deliberately not a server-side tool gate, to keep v1
  simple; the e2e ride asserts the scripted path's behaviour and the live
  smoke eyeballs the real-brain path.
- Usage metering: narration turns go through the same `UsageMeter` as any
  turn — cost is visible in the footer chip and Admin card, no special-casing.

### 3.4 `JarvisNarrator` preference (domain)

`JarvisNarratorPreference = "on" | "off"`, default `"on"` (locked decision 3).
Budgeted blast radius (the governance-round lesson): domain type + default,
4 storage adapters, preferences contract test, `JarvisPreferencesPresenter`,
both bindings, the Preferences modal row in both clients, ui-contract spec,
fixtures.

### 3.5 Scripted brain + persona

- `ScriptedJarvisEngine` gains a `narration` intent: input matching
  `^\[narration\]` yields canned, symbol-aware narration deltas ending with an
  offer ("Shall I set up the vol workspace?"), priming the follow-up
  `setupWorkspace` intent. Regex ordering reviewed against existing rules (the
  R1 "volatil" substring-collision lesson — the `[narration]` prefix anchor
  makes this collision-proof).
- `jarvisPersona.ts` gains the narration section (brief, factual, ≤2 sentences,
  offer-not-execute, no tool calls).

## 4. Deliverable 3 — the thesis showcase

### 4.1 `docs/showcase/machine-boundary-agent-reach.html`

Self-contained (CSP-clean, no external assets), gh-pages published via
`publish-site.yml`, presentation-ready. Content:

1. **The claim** (from §2 of the 2026-07-12 spec): every AI-era capability
   falls out of the same clean-architecture decisions, none made "for AI".
2. **The natural experiment** (this round's centerpiece): when the agent
   arrived, its reach was *exactly* coextensive with the machine boundary.
   Every state behind an intent (layout, equities workspace, panels,
   preferences) was drivable with **zero new state code**; the only
   unreachable states were the two `useState` pockets (`App.tsx` workspace
   tab, `FxViewProvider` sub-tabs/filter) — the two places the doctrine was
   relaxed. Side-by-side code: the `useState` version (no path from the
   composition root to `setActiveTab`) vs the machine version (two callers,
   one intent).
3. **The toll receipt:** the entire migration cost of "an AI drives the app"
   was one small machine + two rewired components — vs "rewrite your state
   layer" in a hooks-era codebase.
4. The updated capability-by-capability receipt table, with shipped-PR
   references (P1 #405, P3 #444, P4 #453, governance #472, genUI #488,
   this round).

### 4.2 Architecture doc

`docs/architecture/18-jarvis-ai-agent-surface.md` gains **§18.17** (app-driving
+ narrator: the DriveCommand vocabulary, the driver/nav/narrator machines, the
offers-never-executes rule, the caps) and cross-links the showcase page.
`docs/STATUS.md` and `docs/running-real-jarvis.md` updated per the standing
skills.

## 5. Testing strategy (no Anthropic calls anywhere in CI)

| Layer | What |
|---|---|
| shared | `parseDriveBatch` property/boundary tests (1–8 cap inclusive at both bounds — the R1 mutation lesson); schema anti-drift pin; literal-union mirror pins (domain-importable unions asserted directly; client-core unions pinned in a client-core-side test) |
| server | `driveAppTool` gate integration (valid batch → `emitDrive` + accepted summary; invalid → rejected summary, no emit); persona few-shot envelope conformance extended to `drive_app`; scripted `setupWorkspace` + `narration` intents |
| client-core | marble tests: `WorkspaceNavMachine`, `JarvisDriverMachine` (ordering, stagger under test scheduler, skip-and-continue, idempotent setters, freeze collapse), `detectAnomalies` (edge-triggering, per-symbol windows), `NarratorMachine` (cooldown, session cap, preference gate live-toggle), `JarvisMachine.narrate` (origin flag, unread flare, queue interleave with `send`); composition wiring tests incl. the exploding-source guard |
| ui-contract | nav promotion (tab click still switches; machine-driven switch re-renders), driven-pulse attribute, narrator transcript styling + orb unread flare — shared specs, both frameworks |
| e2e (scripted) | the flagship ride: narration appears + orb flares → reply "yes" → assert tab switch, layout change, indicator on, panel spawned, timeline entries. Both web clients. Determinism seam: a dev-only query param (`?narratorThresholds=test`, read by `buildBrowserPorts` in dev builds only, absent from prod bundles) injects a near-zero `AnomalyDetectorConfig`, so the sim's first ticks fire the detector within seconds. The real thresholds' math is covered by the marble tier; e2e covers the plumbing. |
| live smoke | `jarvis:smoke:live` gains one drive turn ("switch to equities and maximize the chart" → assert a `command` event with a valid batch). Manual, keyless-refusing, as always. |
| goldens | none planned — the driven pulse is transient and the Preferences row reuses the existing modal row pattern; if the contract tier proves a new steady visual state exists, add scenarios via the standard 5-edit recipe instead of ad-hoc. |

## 6. Out of scope (this round)

- FX sub-tab / quick-filter promotion (the second `useState` pocket — deferred,
  and deliberately kept as the showcase's "still-unreachable" exhibit).
- React Native (parity doctrine covers the two web clients only, as R1).
- Server-side detection / unsolicited server push; sentinels (§10 item 7).
- Narrator-initiated execution of any kind; auto-drive without a user turn.
- L3/L4 panel follow-ons (docking, persistence, dashboards).
- New anomaly types beyond the two v1 triggers; per-anomaly preferences.
- Voice, wake word.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Literal-union drift between `shared` vocab and `client-core`/`domain` sources | pin tests both sides (asserted at build time in CI) |
| Model calls `drive_app` mid-narration despite the persona rule | e2e pins the scripted path; live smoke observes the real path; if the real brain violates in practice, escalate to a server-side per-turn tool gate in a follow-up |
| Narration spam / token burn | edge-triggered detector + 5-min cooldown + 4/session cap + preference off-switch + server-side existing cost caps |
| `switchTab` remount races (`key={activeTab}`) vs staggered batch | equities/layout machines are singletons keyed off the command, not the mounted view; contract test covers "drive equities state while FX is active, then switch" |
| Stagger under freeze violates the motion-free guarantee | stagger constant collapses to 0 under freeze; `/rtc:perf-audit` covers the pulse |
