# Jarvis Brain Picker + Usage Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-selectable Jarvis brain (Scripted / Haiku / Sonnet / Opus + effort) in Preferences, per-turn server routing, in-memory usage metering with an Admin-tab panel, and a live footer chip showing which brain is active.

**Architecture:** Spec: [2026-08-02-jarvis-brain-picker-usage-display-design.md](../specs/2026-08-02-jarvis-brain-picker-usage-display-design.md). The `JarvisBrain` vocabulary lives in **domain** (it is a preference value space; `shared` already depends on domain, so wire types import it from there). Additive wire fields only. Server holds up to two sessions per connection and routes each turn by the validated `brain`. Display-only: NO automatic gating.

**Tech Stack:** existing — rxjs machines, ws-effects, `@rtc/ui-contract` swap-trio, no new dependencies.

## Global Constraints

- **Display-only round.** No window gating, no loop-swap-on-exhaustion, no persistence. The `UsageMeter` resets on server restart (Admin panel says so).
- **Domain edits are CONFINED to the preferences surface**: `packages/domain/src/preferences/preferences.ts`, `ports/preferencesPort.ts`, `ports/__contracts__/PreferencesPortContract.ts`, `simulators/PreferencesSimulator.ts`, plus `src/index.ts` exports. NOTHING else under `packages/domain/` may change.
- **The brain vocabulary is closed and server-enforced**: `JarvisBrain = "scripted" | "claude-haiku-4-5" | "claude-sonnet-5" | "claude-opus-5"`. `DEFAULT_JARVIS_BRAIN = "claude-haiku-4-5"`, `DEFAULT_JARVIS_EFFORT = "medium"`. A wire `brain`/`effort` that fails its guard or names an un-offered brain resolves to the connection's default — never an error, never a raw string reaching the SDK.
- **Env precedence unchanged:** `RTC_JARVIS_FAKE=1` wins over the key (brains `["scripted"]`); key → `["scripted","claude-haiku-4-5","claude-sonnet-5","claude-opus-5"]`, default Haiku; neither → `available:false, brains:[]` (orb hidden, no chat sessions).
- **`output_config: { effort }` is sent ONLY for `claude-sonnet-5` and `claude-opus-5`** — Haiku 4.5 predates the effort parameter; sending it risks a 400. Encode as a `JARVIS_EFFORT_CAPABLE_BRAINS` set. (Implementer: verify against the installed `@anthropic-ai/sdk` types; if they prove Haiku accepts it, keep the set anyway — capability sets beat model-name conditionals.)
- **No Anthropic API call in any CI-run test** (RunnerFactory fakes as in P3). No network in tests.
- **Wire changes are additive**; a P4-era client against this server keeps working (it sends no `brain` → default routing), and this client against a pre-round server keeps working (absent `brains` in availability → treat as all-offered; transitional-skew mislabel accepted and noted in §18.15).
- Repo gates as always: biome ci, both ESLint configs, knip, dep-cruiser, grep gates (no rxjs/localStorage/fetch in `src/ui`), `.js` ESM specifiers in nodenext packages, handler naming (`rtc/name-functions-by-effect`), React Compiler (no manual memo), both web clients' ui:contract coverage ≥95%.
- **RN compiles**: `AsyncStoragePreferencesAdapter` gains both keys INCLUDING in `selfHydrate()` (the login-wait pair was omitted there once — do not repeat). No RN UI this round.
- Visual goldens: new/changed scenarios are captured for `react-local/darwin-arm64` locally; the x86 `react/` set is regenerated via the `update-visual-goldens` dispatch at ship time (post-merge, as usual).

## File Structure (per task below)

New: `packages/domain/src/preferences/` additions; `packages/shared/src/jarvis/jarvisUsage.ts`; `packages/server/src/services/UsageMeter.ts`; `packages/server/src/effects/adminJarvisUsage.effects.ts`; `packages/client-core/src/presenters/JarvisUsagePresenter.ts`; `packages/client-{react,solid}/src/ui/shell/status/JarvisStatusChip.tsx`; `packages/client-{react,solid}/src/ui/admin/jarvis/JarvisUsageCard.tsx`.
Modified: wire types, `agentLoop.ts`, `AnthropicAgentSession.ts`, `jarvis.effects.ts`, `serviceContainer.ts`, server `index.ts`, `WsJarvisAdapter.ts`, `JarvisMachine.ts`, `composition.ts`, both bindings, three preferences adapters, both PreferencesModals, both StatusBars, both Admin registries, ui-contract world/pages/specs/fixtures/scenarios, docs.

---

### Task 1: Domain — the brain/effort preference vocabulary

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts` (append)
- Modify: `packages/domain/src/ports/preferencesPort.ts`
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts`
- Modify: `packages/domain/src/index.ts` (exports)

**Interfaces (Produces — later tasks rely on these exact names):**

```ts
// preferences.ts
export type JarvisBrain =
  | "scripted"
  | "claude-haiku-4-5"
  | "claude-sonnet-5"
  | "claude-opus-5";
export const JARVIS_BRAINS: readonly JarvisBrain[] = [
  "scripted",
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
];
export const DEFAULT_JARVIS_BRAIN: JarvisBrain = "claude-haiku-4-5";
export function isJarvisBrain(value: unknown): value is JarvisBrain;

export type JarvisEffort = "low" | "medium" | "high";
export const JARVIS_EFFORTS: readonly JarvisEffort[] = ["low", "medium", "high"];
export const DEFAULT_JARVIS_EFFORT: JarvisEffort = "medium";
export function isJarvisEffort(value: unknown): value is JarvisEffort;

/** UI/footer display names — the wire and storage always use the id. */
export const JARVIS_BRAIN_LABELS: Record<JarvisBrain, string> = {
  scripted: "scripted",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-opus-5": "Opus 5",
};

// preferencesPort.ts — two new pairs, mirroring the existing 15 exactly:
jarvisBrain$(): Observable<JarvisBrain>;
setJarvisBrain(brain: JarvisBrain): void;
jarvisEffort$(): Observable<JarvisEffort>;
setJarvisEffort(effort: JarvisEffort): void;
```

- [ ] **Step 1:** Add contract coverage first: two `describe` blocks in `PreferencesPortContract.ts` following the `loginWaitStyle`/`loginWaitDelay` blocks (`:248-330`) verbatim in shape — replay-current default on subscribe, set→emit, distinct values. Run `pnpm --filter @rtc/domain test` — expect FAIL (port lacks the members).
- [ ] **Step 2:** Add the types/consts/guards to `preferences.ts` (guard bodies: `JARVIS_BRAINS.includes(value as JarvisBrain)` cast-free via `(JARVIS_BRAINS as readonly unknown[]).includes(value)` — copy `isPowerSaverLevel`'s exact idiom at `preferences.ts:243-264`), the port members, the `PreferencesSimulator` subjects + getters/setters (mirror `:77-124`/`:217-230`), and the `index.ts` exports.
- [ ] **Step 3:** `pnpm --filter @rtc/domain test && pnpm --filter @rtc/domain build` — PASS. Verify domain confinement: `git diff --name-only -- packages/domain/` lists ONLY the five files above.
- [ ] **Step 4:** Commit: `feat(domain): jarvisBrain + jarvisEffort preference vocabulary`

---

### Task 2: Shared — wire extensions + usage snapshot type

**Files:**
- Modify: `packages/shared/src/jarvis/jarvisEvent.ts`
- Create: `packages/shared/src/jarvis/jarvisUsage.ts`
- Modify: `packages/shared/src/protocol/messages.ts` (+ its test)
- Modify: `packages/shared/src/index.ts`

**Interfaces (Produces):**

```ts
// jarvisEvent.ts — ADDITIVE only:
export interface JarvisAvailabilityPayload {
  readonly available: boolean;
  /** Absent on pre-round servers — consumers treat absent as "all offered". */
  readonly brains?: readonly JarvisBrain[];
  readonly defaultBrain?: JarvisBrain;
}
export interface JarvisChatPayload {
  readonly text: string;
  readonly turnId: string;
  readonly history?: readonly JarvisHistoryEntry[];
  readonly brain?: JarvisBrain;      // NEW, optional
  readonly effort?: JarvisEffort;    // NEW, optional
}

// jarvisUsage.ts (new)
export interface JarvisBrainUsageRow {
  readonly brain: JarvisBrain;
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  /** Display-only estimate from the server price table; 0 for scripted. */
  readonly estimatedCostUsd: number;
}
export interface JarvisUsageSnapshot {
  readonly windowStartMs: number;   // epoch ms; 0 = no turn recorded yet
  readonly windowEndMs: number;
  readonly currentWindow: readonly JarvisBrainUsageRow[];
  readonly sinceBoot: readonly JarvisBrainUsageRow[];
}

// messages.ts
CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE = "admin.jarvisUsage.subscribe"
SERVER_MSG.ADMIN_JARVIS_USAGE = "admin.jarvisUsage"
```

`JarvisBrain`/`JarvisEffort` are IMPORTED from `@rtc/domain` (dependency already flows shared→domain).

- [ ] **Step 1:** Extend `messages.test.ts` (vocabulary uniqueness/shape assertions follow the existing pattern) — FAIL.
- [ ] **Step 2:** Implement all four files; re-export the new types from `index.ts` next to the existing jarvis exports (`index.ts:33-40`).
- [ ] **Step 3:** `pnpm --filter @rtc/shared test && pnpm --filter @rtc/shared build` — PASS. Then `pnpm --filter @rtc/server test` — must still PASS untouched (fields are optional).
- [ ] **Step 4:** Commit: `feat(shared): brain/effort on the jarvis wire + usage snapshot vocabulary`

---

### Task 3: The three preferences storage adapters

**Files:**
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts` (+ existing test file beside it)
- Modify: `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` (+ test)
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` (+ test)

Storage keys: `rt-jarvis-brain`, `rt-jarvis-effort`. Follow the login-wait pair's exact shape in each adapter: key consts (react `:52-53` pattern), `isJarvisBrain`/`isJarvisEffort` guards imported from domain (no local re-implementations), subjects, constructor seeding, getter/setter pairs. **RN:** add both to `StoredPreferences`, the `readStoredPreferences()` batch, `hydrate()` AND `selfHydrate()` (the login-wait pair is missing from `selfHydrate()` — do not copy that omission; fix nothing else there).

- [ ] **Step 1:** Each adapter's existing test suite runs the shared `PreferencesPortContract` — after Task 1 it FAILS against all three (missing members). Run each package's focused test to see it.
- [ ] **Step 2:** Implement all three adapters.
- [ ] **Step 3:** `pnpm --filter @rtc/client-react --filter @rtc/client-solid --filter @rtc/client-react-native test` — PASS (RN: jest). Typecheck all three.
- [ ] **Step 4:** Commit: `feat(clients): persist jarvisBrain/jarvisEffort in all three preference adapters`

---

### Task 4: Server — `UsageMeter`

**Files:**
- Create: `packages/server/src/services/UsageMeter.ts`
- Test: `packages/server/src/services/UsageMeter.test.ts`
- Modify: `packages/server/src/services/serviceContainer.ts` (field `usageMeter: UsageMeter`, constructed in `createServices()`)

**Interfaces (Produces):**

```ts
export const JARVIS_USAGE_WINDOW_MS = 18_000_000; // 5h

/** $/Mtok input, output. Cache reads bill at 10% of input; cache writes at 125%. */
export const JARVIS_PRICE_TABLE: Record<Exclude<JarvisBrain, "scripted">, { inputUsdPerMtok: number; outputUsdPerMtok: number }> = {
  "claude-haiku-4-5": { inputUsdPerMtok: 1, outputUsdPerMtok: 5 },
  "claude-sonnet-5": { inputUsdPerMtok: 3, outputUsdPerMtok: 15 },
  "claude-opus-5": { inputUsdPerMtok: 5, outputUsdPerMtok: 25 },
};

export interface JarvisTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export class UsageMeter {
  constructor(now?: () => number);           // injectable clock, default Date.now
  recordTurn(brain: JarvisBrain): void;       // called by the effect per routed turn
  recordTokens(brain: JarvisBrain, usage: JarvisTokenUsage): void; // Anthropic session, per iteration
  readonly snapshot$: Observable<JarvisUsageSnapshot>; // BehaviorSubject-backed, emits current on subscribe + on every record
}
```

Window semantics: the current window anchors at the first `recordTurn`/`recordTokens` after the previous window's end (or ever); when `now() >= windowEndMs`, the current-window accumulator resets (sinceBoot keeps accumulating) and the next record re-anchors. Cost: `(input*in + output*out + cacheRead*in*0.1 + cacheCreation*in*1.25) / 1e6`, scripted rows always `estimatedCostUsd: 0`.

- [ ] **Step 1:** TDD with an injected fake clock: empty snapshot shape; recordTurn increments; recordTokens accumulates + cost math (exact expected numbers in the test, e.g. haiku 1_000_000 input = $1.00); window roll (advance clock past 5h → current resets, sinceBoot persists, windowStart re-anchors); snapshot$ replay-current.
- [ ] **Step 2:** Implement; wire into `serviceContainer.ts` (`usageMeter: new UsageMeter()`).
- [ ] **Step 3:** `pnpm --filter @rtc/server test && pnpm --filter @rtc/server build` — PASS.
- [ ] **Step 4:** Commit: `feat(server): UsageMeter — in-memory 5h-window jarvis usage accounting`

---

### Task 5: Server — per-turn model/effort + usage reading in the Anthropic session

**Files:**
- Modify: `packages/server/src/agent/agentLoop.ts` (AgentSession.runTurn gains an options param)
- Modify: `packages/server/src/agent/AnthropicAgentLoop.ts` + `AnthropicAgentSession.ts` (+ tests)
- Modify: `packages/server/src/agent/ScriptedAgentSession.ts` (accept+ignore options — signature only)
- Modify: `packages/server/src/agent/jarvisRunnerConfig.ts`
- Modify: `scripts/jarvis-live-smoke.ts` (send `brain` explicitly on one turn; assert the turn completes)

**Interfaces:**

```ts
// agentLoop.ts
export interface JarvisTurnOptions {
  readonly brain?: Exclude<JarvisBrain, "scripted">; // resolved+validated upstream
  readonly effort?: JarvisEffort;
}
export interface AgentSession {
  runTurn(text: string, history: readonly JarvisHistoryEntry[], options?: JarvisTurnOptions): Observable<JarvisEvent>;
  // resolveConfirmation / cancelTurn / dispose unchanged
}

// jarvisRunnerConfig.ts
export const JARVIS_DEFAULT_BRAIN — re-export from @rtc/domain? NO: import and use domain's
  DEFAULT_JARVIS_BRAIN directly; DELETE the JARVIS_MODEL_ID constant (grep for consumers first).
export const JARVIS_EFFORT_CAPABLE_BRAINS: ReadonlySet<JarvisBrain> = new Set(["claude-sonnet-5", "claude-opus-5"]);
// JARVIS_EFFORT stays as the default effort value ("medium").

// AnthropicAgentLoop
export interface AnthropicAgentLoopOptions {
  // existing fields unchanged, plus:
  readonly usageMeter?: Pick<UsageMeter, "recordTokens">;
}
```

In `runOneTurn` (`AnthropicAgentSession.ts:471-489`): `model: options?.brain ?? DEFAULT_JARVIS_BRAIN`; include `output_config: { effort: options?.effort ?? JARVIS_EFFORT }` ONLY when the model is in `JARVIS_EFFORT_CAPABLE_BRAINS`. Widen the seam type (`:103-106`):

```ts
export interface AnthropicFinalMessage {
  readonly stop_reason: string | null;
  readonly content: readonly unknown[];
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number;
    readonly cache_creation_input_tokens?: number;
  };
}
```

After each per-iteration `await messageStream.finalMessage()` (`:536`), when a meter is present, `recordTokens(model, {...usage with ?? 0 defaults})`. The faked RunnerFactory in tests supplies `usage` on its final messages to pin the accounting.

- [ ] **Step 1:** TDD in the existing `AnthropicAgentSession` test file's style: model override reaches the faked runner's captured params; effort present for sonnet/opus, ABSENT for haiku; default model is Haiku when options absent; per-iteration usage recorded into a spy meter (multi-iteration fixture: two messages with distinct usage → both recorded).
- [ ] **Step 2:** Implement. Verify no other consumer of `JARVIS_MODEL_ID` remains (`grep -rn JARVIS_MODEL_ID packages/ scripts/`).
- [ ] **Step 3:** `pnpm --filter @rtc/server test && pnpm --filter @rtc/server build` — PASS.
- [ ] **Step 4:** Commit: `feat(server): per-turn brain/effort in the Anthropic session + usage tap`

---

### Task 6: Server — dual loops, routing, availability payload, usage effect

**Files:**
- Modify: `packages/server/src/agent/agentLoop.ts` (`createAgentLoop` → `createJarvisLoops`)
- Modify: `packages/server/src/effects/jarvis.effects.ts` (+ tests)
- Create: `packages/server/src/effects/adminJarvisUsage.effects.ts` (+ test)
- Modify: `packages/server/src/effects/index.ts`, `packages/server/src/index.ts`

**Interfaces:**

```ts
// agentLoop.ts
export interface JarvisLoops {
  readonly scripted: AgentLoop;
  readonly anthropic: AgentLoop | null;
  readonly brains: readonly JarvisBrain[];
  readonly defaultBrain: JarvisBrain;
}
export function createJarvisLoops(
  env: NodeJS.ProcessEnv,
  services: ServiceContainer,
  buildAnthropicLoop?: AnthropicLoopBuilder,
): JarvisLoops | null;
// FAKE=1 → { scripted, anthropic: null, brains: ["scripted"], defaultBrain: "scripted" }
// key+builder → { scripted, anthropic, brains: [all four], defaultBrain: DEFAULT_JARVIS_BRAIN }
// key without builder → warn (as today) then fall through; neither → null

// jarvis.effects.ts
export function jarvisEffects(loops: JarvisLoops | null): WsEffect<Ctx>[];
```

Routing inside the per-connection effect body: hold `let scriptedSession: AgentSession | null = null; let anthropicSession: AgentSession | null = null;` created lazily on first use. `parseChatPayload` additionally reads `brain`/`effort` through the domain guards; resolution: `brain` valid AND in `loops.brains` → use it, else `loops.defaultBrain`. `"scripted"` → scripted session (`runTurn(text, history)`); real model → anthropic session (`runTurn(text, history, { brain, effort })`). Record `ctx.usageMeter.recordTurn(resolvedBrain)` once per accepted chat frame. `jarvis.confirm` / `jarvis.cancel` forward to BOTH live sessions (the P3 `ownedConfirmationIds` guard and per-session cancel keep that safe — pin with a test). `finalize` disposes both. The `concatMap` chat serialization stays connection-wide (one queue across both brains). Availability responder payload: `{ available: loops !== null, brains: loops?.brains ?? [], defaultBrain: loops?.defaultBrain ?? "scripted" }`.

`adminJarvisUsage.effects.ts` — the subscribe→push stream, following `fx.effects.ts:41-67`'s `stream(...)` pattern:

```ts
const jarvisUsage$: WsEffect<Ctx> = stream(
  CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
  (_payload, ctx) => {
    return ctx.usageMeter.snapshot$.pipe(
      throttleTime(1_000, undefined, { leading: true, trailing: true }),
      map((snapshot) => out(SERVER_MSG.ADMIN_JARVIS_USAGE, snapshot)),
    );
  },
);
```

- [ ] **Step 1:** TDD in `jarvis.effects` test style (faked loops with spy sessions): default routing (no brain → defaultBrain, reaches anthropic with options), scripted routing (anthropic spy untouched), invalid/un-offered brain → default, dual-session laziness (scripted-only conversation never constructs the anthropic session), confirm/cancel forwarded to both without cross-talk, both disposed on finalize, availability payload for all three env shapes, usage effect emits replay-current then throttled pushes.
- [ ] **Step 2:** Implement; update `effects/index.ts` (`buildEffects(loops)`) + `index.ts` (`const jarvisLoops = createJarvisLoops(process.env, services, buildAnthropicLoop)` — the Anthropic builder now also passes `usageMeter: services.usageMeter`).
- [ ] **Step 3:** `pnpm --filter @rtc/server test && pnpm --filter @rtc/server build && pnpm check:deps && pnpm lint:dead` — PASS.
- [ ] **Step 4:** Commit: `feat(server): dual-brain routing + availability brains + admin usage stream`

---

### Task 7: client-core — machine, adapters, sim ports, presenters, bindings

**Files:**
- Modify: `packages/client-core/src/adapters/WsJarvisAdapter.ts` (+ test)
- Modify: `packages/client-core/src/presenters/JarvisMachine.ts` (+ test)
- Create: `packages/client-core/src/presenters/JarvisUsagePresenter.ts` (+ test)
- Modify: `packages/client-core/src/adapters/portFactory.ts`, `packages/client-core/src/composition.ts`
- Modify: `packages/react-bindings/src/createViewModel.ts`, `packages/solid-bindings/src/createViewModel.ts` (+ their tests)

**Interfaces:**

```ts
// client-core — a structured availability replaces the bare boolean END-TO-END this round:
export interface JarvisAvailability {
  readonly available: boolean;
  readonly brains: readonly JarvisBrain[];
  readonly defaultBrain: JarvisBrain;
}
// WsJarvisAdapter.availability$(): Observable<JarvisAvailability>
//   — absent wire fields (pre-round server) map to
//     { available, brains: available ? JARVIS_BRAINS : [], defaultBrain: DEFAULT_JARVIS_BRAIN }
// JarvisPort.ask gains: ask(text: string, options?: { brain: JarvisBrain; effort: JarvisEffort }): Observable<JarvisEvent>
//   — ScriptedJarvisAdapter (extends the engine, ask(text)) remains structurally valid: fewer params is assignable; it ignores options.

// JarvisMachine
export interface JarvisState {
  // existing fields unchanged, plus:
  readonly available: boolean;              // kept
  readonly brains: readonly JarvisBrain[];
  readonly effectiveBrain: JarvisBrain;     // preferred if offered, else availability.defaultBrain
}
// JarvisDeps: availability$?: Observable<JarvisAvailability>;
//   preferredBrain$: Observable<JarvisBrain>; effort$: Observable<JarvisEffort>;
// INITIAL: brains: JARVIS_BRAINS, effectiveBrain: DEFAULT_JARVIS_BRAIN (available: true as today)
// send path: deps.port.ask(text, { brain: effectiveBrain, effort }) using the synchronous caches
//   (mirror the existing `available` mutable-cache idiom at JarvisMachine.ts:268,288-290).

// JarvisUsagePresenter
export class JarvisUsagePresenter {
  readonly usage$: Observable<JarvisUsageSnapshot | null>; // null until first snapshot
  constructor(port: JarvisUsagePort);
}
// client-core adapters: JarvisUsagePort { usage$(): Observable<JarvisUsageSnapshot> }
//   — WS impl: on gatewayConnected, send ADMIN_JARVIS_USAGE_SUBSCRIBE, stream ADMIN_JARVIS_USAGE payloads
//     (mirror availability$'s reconnect-re-arm shape at WsJarvisAdapter.ts:322-332).
//   — sim impl (portFactory.createSimulatorPorts): of({ windowStartMs: 0, windowEndMs: 0, currentWindow: [], sinceBoot: [] })
// Sim-mode jarvis availability (machine deps default when no availability$ given):
//   of({ available: true, brains: ["scripted"], defaultBrain: "scripted" })

// bindings (both): useJarvisUsage(): JarvisUsageSnapshot | null via bind(presenters.jarvisUsage.usage$, null)
//   — follow the useTopology wiring pattern (createViewModel.ts:358-359 react).
```

`composition.ts`: wire `preferredBrain$: ports.preferences.jarvisBrain$()`, `effort$: ports.preferences.jarvisEffort$()` into the jarvis machine deps; register `jarvisUsage: new JarvisUsagePresenter(ports.jarvisUsage)`.

- [ ] **Step 1:** TDD: adapter availability parsing (new-shape, old-shape compat, timeout-false shape carries empty brains); adapter ask() forwards brain/effort onto the chat payload; machine effective-brain resolution (preferred offered → preferred; not offered → defaultBrain; availability flip mid-session re-resolves; send() carries the CURRENT effective brain); presenter replay/null-start; sim ports shapes; bindings hook tests per existing patterns.
- [ ] **Step 2:** Implement across the listed files.
- [ ] **Step 3:** `pnpm --filter @rtc/client-core --filter @rtc/react-bindings --filter @rtc/solid-bindings test` + builds — PASS.
- [ ] **Step 4:** Commit: `feat(client-core): brain-aware jarvis machine + usage presenter + sim ports`

---

### Task 8: React UI — Preferences section, footer chip, Admin card

**Files:**
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx`
- Create: `packages/client-react/src/ui/shell/status/JarvisStatusChip.tsx` (+ `.module.css` additions in `StatusBar.module.css`)
- Modify: `packages/client-react/src/ui/shell/status/StatusBar.tsx`
- Create: `packages/client-react/src/ui/admin/jarvis/JarvisUsageCard.tsx` (+ `.module.css`)
- Modify: the Admin registration sites (`AdminDashboard.tsx` — place the card in the existing grid)

Preferences: a real-wired "JARVIS" group using two `PrefSegment` rows exactly in the login-wait idiom (`PreferencesModal.tsx:170-188`): `pref-segment-jarvisBrain` (options from `JARVIS_BRAINS` labelled via `JARVIS_BRAIN_LABELS`, each real-model option `disabled` when not in the machine's `brains`) and `pref-segment-jarvisEffort` (disabled entirely when the selected brain is `"scripted"`). `PrefSegment` may need an optional per-option `disabled` — extend it minimally if so (both frameworks, same prop name).

Footer chip (new module, `ConnectionStatusBar` idiom):

```tsx
export function JarvisStatusChip(): ReactElement | null {
  const { useJarvis } = useViewModel();           // the existing jarvis machine hook — verify exact name in createViewModel.ts
  const { state } = useJarvis();
  if (!state.available) {
    return null;
  }
  return (
    <span data-testid="jarvis-status-chip" data-brain={state.effectiveBrain} className={styles.jarvisChip}>
      JARVIS · {JARVIS_BRAIN_LABELS[state.effectiveBrain]}
    </span>
  );
}
```

Mounted in `StatusBar.tsx` after the operator span with the existing `metricSep` separator. Admin card: title `JARVIS USAGE`, `useJarvisUsage()`; null → `NO USAGE DATA`; rows per brain (turns, in/out tokens, est. cost `$x.xx`), current window + since-boot columns or stacked lists, the window countdown derived from `windowEndMs` minus a ticking clock is **decorative-static** this round (print the absolute reset time instead — no timers in dumb UI), plus the caveat line `resets on server restart`.

- [ ] **Step 1:** Implement all three surfaces (no manual memo; no rxjs in src/ui — data arrives via hooks only).
- [ ] **Step 2:** `pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react build` + `pnpm exec biome ci .` scoped clean + `pnpm lint:eslint`.
- [ ] **Step 3:** Commit: `feat(client-react): jarvis brain prefs + footer chip + admin usage card`

---

### Task 9: Solid UI parity

**Files:** the Solid twins of every Task 8 file (`packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx`, `ui/shell/status/{JarvisStatusChip.tsx,StatusBar.tsx}`, `ui/admin/jarvis/JarvisUsageCard.tsx`, Admin registration).

Byte-parallel logic, framework idiom only (`<Show>`, `createSignal`, accessors, `class`); identical testids, labels, options, CSS class names (the visual tier asserts both clients against ONE golden set — pixel drift between them is a failure).

- [ ] **Step 1:** Implement; `pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid build`, lint clean.
- [ ] **Step 2:** Commit: `feat(client-solid): jarvis brain prefs + footer chip + admin usage card (parity)`

---

### Task 10: ui-contract — world, pages, contract specs, visual scenarios

**Files:**
- Modify: `packages/ui-contract/src/shared/harness/world.ts` — `World.jarvisBrain`/`jarvisEffort` BehaviorSubjects + `CommandLog.jarvisBrainSets/jarvisEffortSets` + seeds (`jarvisBrainSeed`, `jarvisEffortSeed`), and REPLACE the boolean `jarvisAvailability` subject/seed with the structured `JarvisAvailability` (update the two P3 specs that seed it).
- Modify: `packages/ui-contract/src/shared/pages/shell/prefs/PreferencesModalPage.ts` (+ a `StatusBarPage` if none exists; `packages/ui-contract/src/shared/pages/shell/jarvis/` for chip queries otherwise)
- Modify: `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts`; Create: `packages/ui-contract/src/specs/shell/status/JarvisStatusChip.contract.spec.ts`, `packages/ui-contract/src/specs/admin/JarvisUsageCard.contract.spec.ts`
- Modify: `packages/ui-contract/src/visual/fixtures.ts` + `scenarios.ts` (follow the 5-edit recipe in the docs; new scenarios: `jarvis/status-chip-scripted`, `jarvis/status-chip-haiku`, `admin/jarvis-usage-card`, plus the prefs modal's existing scenarios absorb the new section)

Contract coverage (shared, runs against BOTH frameworks): brain segment renders four options with real models disabled when un-offered; selecting a brain logs `jarvisBrainSets`; effort disabled when scripted; chip hidden when unavailable, text/`data-brain` per effective brain incl. the preferred-not-offered fallback; usage card empty + populated states (fixture snapshot with two brains, cost strings).

- [ ] **Step 1:** Write specs first, watch both clients' contract runs fail, then fix the harness/world wiring until green.
- [ ] **Step 2:** `pnpm --filter @rtc/client-react test:ui:contract:coverage && pnpm --filter @rtc/client-solid test:ui:contract:coverage` — both PASS with gates ≥95% (check the per-file report for the NEW files — no aggregate hiding).
- [ ] **Step 3:** Capture `react-local/darwin-arm64` goldens for the new scenarios + any changed prefs-modal goldens; solid visual tier asserts against them.
- [ ] **Step 4:** Commit: `test(ui-contract): brain picker + status chip + usage card contract/visual coverage`

---

### Task 11: Docs + STATUS

**Files:** `docs/architecture/18-jarvis-ai-agent-surface.md` (append §18.15), `docs/STATUS.md`, `docs/running-real-jarvis.md`, `CLAUDE.md` (server line: mention the default is now Haiku + the brain field; one sentence).

§18.15 records: the brain vocabulary living in domain and why (the "deliberate departure" rationale from the spec — preference value space, not SDK leakage), per-turn routing + dual sessions, availability's `brains`, the UsageMeter (windows, price table, in-memory caveat), the footer chip + Admin card, the effort-capability set decision, the old-server/old-client skew notes, and what item (2) auto-gating will build on. STATUS: governance entry updates (round 1 SHIPPED, PR #NN placeholder filled at ship; remaining items 2/5 stay pending). `running-real-jarvis.md`: default is Haiku now; the Preferences escape hatch replaces "flip env to demo scripted".

- [ ] **Step 1:** Write; `pnpm check:doc-links` PASS.
- [ ] **Step 2:** Commit: `docs(jarvis): §18.15 brain picker + usage display receipt`

---

## Self-Review Notes

- **Spec coverage:** §3 vocabulary → Task 1; §4 wire → Task 2 (+6 payload emission, +7 parsing); §5 routing/dual sessions/default flip/effort capability → Tasks 5–6; §6 meter → Task 4 (+5 tap, +6 stream); §7 preferences + blast radius → Tasks 1,3,7,8,9,10 (all 14 surveyed sites are covered; world.ts is site 12, pages 13, specs 14); §8 footer → Tasks 8–10; §9 admin panel incl. sim-mode empty shape → Tasks 7–10; §10 testing → embedded per task; §11 open items → Task 11 docs only.
- **Type consistency:** `JarvisBrain`/`JarvisEffort`/`DEFAULT_JARVIS_BRAIN` always from `@rtc/domain`; `JarvisUsageSnapshot` always from `@rtc/shared`; `JarvisTurnOptions` (Task 5) is what Task 6's routing passes; `JarvisAvailability` (Task 7) is client-core's structured type consumed by Tasks 8–10; `JarvisLoops` (Task 6) is what `index.ts` and `buildEffects` thread.
- **Known risks, called out where they bite:** effort-on-Haiku (Task 5 constraint + capability set); the RN `selfHydrate` omission trap (Task 3); `PrefSegment` per-option disabled may be a new prop (Task 8, mirrored in 9); the boolean→structured `jarvisAvailability` world seed is a BREAKING harness change confined to ui-contract + the two P3 specs that seed it (Task 10).
