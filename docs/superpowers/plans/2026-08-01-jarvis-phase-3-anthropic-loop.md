# Jarvis Phase 3 — `@rtc/agent-tools` + Real Anthropic Tool-Runner Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scripted brain with a real Claude agent in ws mode — a new `@rtc/agent-tools` package defines seven desk tools over the domain ports, the server gains an `AnthropicAgentLoop` (Anthropic SDK tool runner, `claude-opus-5`, streaming) behind the existing `AgentLoop` seam, sessions become per-WS-connection, the wire gains turn correlation + cancel + an availability handshake, and the client hides the orb when Jarvis is absent. `RTC_JARVIS_FAKE=1` keeps the scripted loop as the CI path and demo fallback.

**Architecture:** `createWsListener` invokes each effect function fresh per socket, so per-connection state falls out of allocating it inside the effect body: the `AgentLoop` seam evolves into a session factory (`createSession(): AgentSession`), and the Jarvis effect creates one session per connection whose history dies with the socket (spec §3.3's `JarvisSession`). `@rtc/agent-tools` stays SDK-free (pure tool definitions: JSON Schema + a `run` over domain ports — testable against simulators); only the server's loop adapts them to the SDK's `betaTool` form. `execute_trade` never executes directly: it awaits an injected confirm gate, which the session wires to the existing `JARVIS_CONFIRM_REQUEST`/`JARVIS_CONFIRM` round-trip — the P1/P2 confirm card works unchanged.

**Tech Stack:** `@anthropic-ai/sdk` (server-only runtime dep; beta tool runner `client.beta.messages.toolRunner` + `betaTool` from `@anthropic-ai/sdk/helpers/beta/json-schema` — raw JSON Schema, no Zod), model `claude-opus-5` (adaptive thinking by default — omit the `thinking` param; the parent spec's `claude-opus-4-8` is superseded, and per current API guidance the fixed-ID scheme has no date suffix), streaming with `finalMessage()`, prompt caching (`cache_control` on the stable system+tools prefix), `stop_reason: "refusal"` handling.

**Parent spec (authoritative):** [../specs/2026-07-12-jarvis-ai-assistant-design.md](../specs/2026-07-12-jarvis-ai-assistant-design.md) §3.2–§3.3, §4, §5, §6. P2 receipt: [../../architecture/18-jarvis-ai-agent-surface.md](../../architecture/18-jarvis-ai-agent-surface.md) §18.12.

## Global Constraints

- **`@rtc/domain` stays byte-identical.** The tools consume existing use cases and ports; `ServiceTopologySimulator` and `ServiceHealthPort` already exist in domain — the server *container* gains a `serviceHealth` field, domain gains nothing.
- **No Anthropic API call in any CI-run test, ever.** `AnthropicAgentLoop` unit tests inject a fake runner factory; e2e/fullstack stay on `RTC_JARVIS_FAKE=1`. The only real-key path is the manual `scripts/jarvis-live-smoke.ts` (Task 10), run by a human.
- **`@rtc/agent-tools` dependency rule:** runtime deps = `@rtc/domain` + `rxjs` ONLY (the same rxjs-only-tier as ws-effects/devtools-core, plus domain). It must NOT import `@anthropic-ai/sdk`, `@rtc/shared`, `@rtc/client-core`, or anything server-side. dep-cruiser rule `agent-tools-stays-inner` pins it; **new-package gates checklist (spec §5) is Task 1's definition of done** — root tsconfig refs, `tsconfig.depcruise.json` line pair (dep-cruiser package rules are DORMANT without it), knip workspace keys, `tsconfig.eslint.json` + eslint paths, syncpack, turbo graph, `#/` subpath aliases with `tsc --build && tsc-alias`, `.js` ESM relative specifiers (the P2 Critical class), no local dir named like a runtime dep.
- **Env precedence in `createAgentLoop(env, services)`:** `RTC_JARVIS_FAKE=1` → `ScriptedAgentLoop` (explicit rehearsal override, wins even when a key is present); else `ANTHROPIC_API_KEY` set → `AnthropicAgentLoop`; else `null` (effects except the availability responder not registered). Never log or echo the key.
- **Cost hygiene (spec §3.3), all constants exported from one file:** `JARVIS_MODEL_ID = "claude-opus-5"`, `JARVIS_MAX_TOKENS_PER_TURN = 4_096`, `JARVIS_MAX_TURNS_PER_SESSION = 40` (turn 41+ → polite refusal event, no API call), `JARVIS_HISTORY_MAX_MESSAGES = 30` (older messages dropped from the front, never mid tool-use pair).
- **Wire changes are additive** and every new server event echoes the turn's `turnId`. Existing P2 clients ignore unknown fields/messages.
- **All quality gates green** (18 fast gates incl. `check:react-coverage`/`check:compiler`/`check:worklet-order`, typecheck, unit, both contract-coverage bars, biome ci form, name-functions-by-effect, func-style, padding lines, mandatory braces). Ship under `shipping-repo-changes`.
- **UI changes are allowed in this phase** (unlike P2): the machine gains `availability`, the orb hides when unavailable — with contract specs updated in the same task and goldens regenerated ONLY if a default-state pixel changes (the default `available` state must render pixel-identically; assert before assuming).

## File Structure

```
packages/agent-tools/                       (NEW package @rtc/agent-tools)
  package.json, tsconfig.json, tsconfig.depcruise.json entry, vitest config (mirror ws-effects')
  src/index.ts                              barrel
  src/jarvisToolDefinition.ts               JarvisToolDefinition + JarvisToolDeps + ConfirmGate types
  src/buildJarvisTools.ts                   the 7 tool factories over domain ports
  src/__tests__/buildJarvisTools.test.ts    every tool vs simulators; schema validity; timeout
packages/shared/src/protocol/messages.ts    +JARVIS_CANCEL, +JARVIS_SUBSCRIBE (client); +JARVIS_AVAILABILITY (server)
packages/shared/src/jarvis/jarvisEvent.ts   +turnId on payload docs; JarvisChatPayload gains turnId+history; new payload types
packages/server/package.json                +@anthropic-ai/sdk
packages/server/src/services/serviceContainer.ts  +serviceHealth: ServiceTopologySimulator
packages/server/src/agent/agentLoop.ts      AgentLoop → session factory; createAgentLoop 3-way env branch
packages/server/src/agent/ScriptedAgentLoop.ts    adapts to createSession()
packages/server/src/agent/AnthropicAgentLoop.ts   (NEW) the real loop
packages/server/src/agent/jarvisPersona.ts  (NEW) single-file system prompt
packages/server/src/agent/jarvisRunnerConfig.ts   (NEW) model/caps constants
packages/server/src/effects/jarvis.effects.ts     per-connection session; cancel; availability; turnId echo; payload guards
packages/client-core/src/adapters/WsJarvisAdapter.ts   turnId filter + cancel-on-teardown + availability query
packages/client-core/src/adapters/ScriptedJarvisAdapter.ts  unchanged
packages/client-core/src/presenters/JarvisMachine.ts   availability field (sim: always available)
packages/client-core/src/adapters/portFactory.ts       availability wiring per mode
packages/client-{react,solid}/src/ui/shell/jarvis/JarvisOrb.tsx  hidden-when-unavailable
packages/ui-contract/src/specs/shell/jarvis/*          availability specs
tests/fullstack/browser/fullstack.spec.ts   unchanged behavior (FAKE=1 → available; assert orb present)
scripts/jarvis-live-smoke.ts                (NEW) manual real-key conversation smoke
turbo.json / package.json                   ANTHROPIC_API_KEY passthrough (globalPassThroughEnv only — never baked into scripts)
docs: architecture/18 (§18.13), STATUS.md, CLAUDE.md package table
```

**Task order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Tasks 7–8 (client) depend on 2; 9 (UI availability) depends on 7.

---

### Task 1: Scaffold `@rtc/agent-tools` (new-package gates first)

**Files:** Create the package skeleton (package.json name `@rtc/agent-tools`, version/private mirroring `@rtc/ws-effects`; deps `@rtc/domain workspace:*`, `rxjs` at the repo's single range; tsconfig extending the base with `#/` alias; vitest config mirroring ws-effects'); wire EVERY gate from the Global Constraints checklist; add dep-cruiser rule `agent-tools-stays-inner` (may import only domain + rxjs) **plus its `tsconfig.depcruise.json` line pair**.

**Interfaces — Produces (in `src/jarvisToolDefinition.ts`):**

```ts
import type { Observable } from "rxjs";
import type {
  AnalyticsPort, BlotterPort, ExecutionPort, PricingPort,
  ReferenceDataPort, ServiceHealthPort, Direction,
} from "@rtc/domain";

/** One framework-neutral desk tool: JSON Schema in, JSON-serializable result
 * out. SDK-free by design — the server's AnthropicAgentLoop adapts these to
 * the SDK's betaTool form; tests drive `run` directly against simulators. */
export interface JarvisToolDefinition {
  readonly name: string;
  readonly description: string;
  /** Raw JSON Schema (object type, additionalProperties: false, required listed). */
  readonly inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<string>;
}

export interface JarvisConfirmDetails {
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
  readonly quotedPrice: number;
  readonly ratePrecision: number;
}

/** Injected human-in-the-loop gate: resolves true (approved) or false
 * (declined/timeout). The server session wires this to the existing
 * JARVIS_CONFIRM_REQUEST/JARVIS_CONFIRM round-trip. */
export type ConfirmGate = (details: JarvisConfirmDetails) => Promise<boolean>;

export interface JarvisToolDeps {
  readonly referenceData: ReferenceDataPort;
  readonly pricing: PricingPort;
  readonly blotter: BlotterPort;
  readonly analytics: AnalyticsPort;
  readonly execution: ExecutionPort;
  readonly serviceHealth: ServiceHealthPort;
  readonly confirmTrade: ConfirmGate;
}
```

- [ ] **Step 1:** Scaffold the package; add a placeholder export + one trivial test; run `pnpm install`, `pnpm build`, `pnpm typecheck`.
- [ ] **Step 2:** Wire the gates. Verify each one actually FIRES: temporarily add a forbidden import (`@rtc/shared`) and confirm `pnpm check:deps` goes red, then remove it; confirm `pnpm check:scripts`, `pnpm lint:dead`, `pnpm check:versions` pass; run the full 18-gate fast tier.
- [ ] **Step 3:** Commit `feat(agent-tools): scaffold @rtc/agent-tools with the full new-package gate set`.

### Task 2: The seven tools (`buildJarvisTools`)

**Files:** Create `src/buildJarvisTools.ts` + tests. Export `buildJarvisTools(deps: JarvisToolDeps): readonly JarvisToolDefinition[]` and `JARVIS_TOOL_TIMEOUT_MS = 5_000`.

The seven tools (spec §3.2, minus `get_app_context` — deferred with rationale, see self-review):

| name | binding | notes |
|---|---|---|
| `list_currency_pairs` | `CurrencyPairsUseCase` snapshot | returns symbol/precision table |
| `get_price` | `PriceStreamUseCase` first-value snapshot | input `{symbol}`; unknown symbol → descriptive error string result |
| `get_price_history` | `PriceHistoryUseCase` snapshot | input `{symbol}`; return a compact series (timestamp+mid), cap 100 points |
| `get_blotter` | `TradeBlotterUseCase` snapshot | optional `{limit}` (default 20, max 50), newest first |
| `get_analytics` | `AnalyticsUseCase` snapshot | positions + per-position basePnl + headline total |
| `get_service_health` | `deps.serviceHealth` snapshot | service statuses |
| `execute_trade` | `deps.confirmTrade` then `ExecuteTradeUseCase` | **gated**: price snapshot → confirm gate → declined ⇒ result string "The user declined the trade — nothing was executed."; approved ⇒ execute (30s budget, mirroring the engine's `EXECUTION_TIMEOUT_MS` rationale) and report the fill |

Rules binding every tool: reads use `firstValueFrom(source$.pipe(take(1), timeout(JARVIS_TOOL_TIMEOUT_MS)))`; a timeout or thrown error resolves to a **descriptive error string result** (never a rejected promise — the model should see and recover from it); results are compact JSON strings (the model reads them; keep them small); every `inputSchema` sets `additionalProperties: false`; `run` validates its input shape with hand guards before use (malformed input → error-string result).

- [ ] **Step 1 (TDD):** Failing tests: each tool's happy path against the domain simulators (fake timers where sims delay — `ReferenceDataSimulator` has a fixed 1s initial delay; `ExecutionSimulator` fills EURUSD in 0–2s); `execute_trade` declined path never touches `ExecutionPort` (spy); `execute_trade` approved path lands the trade in the blotter stream; unknown-symbol and timeout paths resolve to error strings; every schema has `additionalProperties: false` + a `required` array (walk the definitions in one table test).
- [ ] **Step 2:** Implement; suite green; fast gates green.
- [ ] **Step 3:** Commit `feat(agent-tools): the seven desk tools over the domain ports`.

### Task 3: Wire vocabulary + payload types for P3

**Files:** `packages/shared/src/protocol/messages.ts`, `packages/shared/src/jarvis/jarvisEvent.ts`, `messages.test.ts`.

**Produces:** `CLIENT_MSG.JARVIS_CANCEL = "jarvis.cancel"`, `CLIENT_MSG.JARVIS_SUBSCRIBE = "jarvis.subscribe"`; `SERVER_MSG.JARVIS_AVAILABILITY = "jarvis.availability"`. Payload types in `jarvisEvent.ts`:

```ts
/** One prior conversation turn the client replays for model context. */
export interface JarvisHistoryEntry {
  readonly role: "user" | "jarvis";
  readonly text: string;
}
export interface JarvisChatPayload {
  readonly text: string;
  /** Correlates every server event of this turn; client-generated (crypto.randomUUID). */
  readonly turnId: string;
  /** Optional prior turns, oldest first, capped client-side at 20 entries. */
  readonly history?: readonly JarvisHistoryEntry[];
}
export interface JarvisCancelPayload { readonly turnId: string; }
export interface JarvisAvailabilityPayload { readonly available: boolean; }
```

Every `SERVER_MSG.JARVIS_*` turn-scoped payload additionally carries `readonly turnId: string` (delta/toolEvent/confirmRequest/done/error — extend the wire-rule doc comment: payload = event minus `type`, **plus** `turnId`). `JarvisEvent` itself is unchanged (the adapter strips `turnId` after filtering) — so `JarvisMachine` and the UIs see the exact P1 event shapes.

- [ ] Steps: pin the three new constants in the messages test (existing pattern); add the payload types + doc updates; `turnId` addition documented on the wire rule. Typecheck reveals the P2 call sites that now must supply `turnId` — **do NOT fix them here**; Tasks 5–7 own their sites (if typecheck cannot pass standalone, make `turnId` required on the payload types but leave server/client compilation to the immediately-following tasks in the same PR; run only the shared suite here). Commit `feat(shared): P3 wire vocabulary — turn correlation, cancel, availability, history`.

### Task 4: `AgentLoop` becomes a session factory; container gains `serviceHealth`

**Files:** `packages/server/src/services/serviceContainer.ts` (+`serviceHealth: new ServiceTopologySimulator()` — check its constructor args in domain and mirror how the client sim composes it), `packages/server/src/agent/agentLoop.ts`, `ScriptedAgentLoop.ts`, their tests, `packages/server/src/effects/jarvis.effects.ts` + tests, `index.ts` threading.

**Produces:**

```ts
export interface AgentSession {
  runTurn(text: string, history: readonly JarvisHistoryEntry[]): Observable<JarvisEvent>;
  resolveConfirmation(confirmationId: string, approved: boolean): void;
  /** Abort the in-flight turn (cancel frame / socket close). Idempotent. */
  cancelTurn(): void;
  dispose(): void;
}
export interface AgentLoop { createSession(): AgentSession; }
export function createAgentLoop(env: NodeJS.ProcessEnv, services: ServiceContainer): AgentLoop | null;
```

`ScriptedAgentLoop.createSession()` returns a thin session over the ONE shared `ScriptedJarvisEngine` (scripted turns are stateless; `history` ignored; `cancelTurn` = engine teardown via the subscription the session tracks; `dispose` = cancel + clear pending confirmation). `createAgentLoop` branches per the env-precedence Global Constraint (Anthropic branch lands in Task 6 — until then, key-only env returns `null` with a TODO-free `// AnthropicAgentLoop arrives in the next task` comment is NOT acceptable; instead structure this task so Task 6 only ADDS the branch: gate the branch behind a `buildAnthropicLoop` parameter defaulting to `undefined` — when undefined and a key is present, fall through to scripted-or-null and emit one `console.warn("ANTHROPIC_API_KEY set but the Anthropic loop is not wired")`).

`jarvis.effects.ts` restructure — the per-connection heart:

```ts
export function jarvisEffects(loop: AgentLoop | null): WsEffect<Ctx>[] {
  const availability$: WsEffect<Ctx> = stream(CLIENT_MSG.JARVIS_SUBSCRIBE, () =>
    of(out(SERVER_MSG.JARVIS_AVAILABILITY, { available: loop !== null })));
  if (loop === null) { return [availability$]; }

  const session$: WsEffect<Ctx> = (in$, ctx) => {
    const session = loop.createSession();          // ← fresh per socket
    const chat$ = /* stream(JARVIS_CHAT): validate payload shape (hand guards; bad payload → JARVIS_ERROR with turnId if extractable, else drop+log), then session.runTurn(text, history ?? []) mapped exactly as P2 — WIRE_TYPE_BY_EVENT, body = event minus type — plus turnId spread into every outbound payload */;
    const confirm$ = /* stream(JARVIS_CONFIRM): validated; session.resolveConfirmation */;
    const cancel$ = /* stream(JARVIS_CANCEL): validated; session.cancelTurn(); EMPTY */;
    return merge(chat$(in$, ctx), confirm$(in$, ctx), cancel$(in$, ctx))
      .pipe(finalize(() => { session.dispose(); }));
  };
  return [availability$, session$];
}
```

`buildEffects(loop)` keeps its shape (`allEffects` + `jarvisEffects(loop)` — note availability now registers even when `loop` is null).

- [ ] **Step 1 (TDD):** Failing tests: availability responds `{available:false}` with null loop and `{available:true}` with scripted; **two sockets get distinct sessions** (drive two listener invocations; a confirmation issued on socket A cannot be resolved from socket B — pins the P2 cross-socket-forgery fix structurally); every outbound turn event carries the request's `turnId`; `jarvis.cancel` mid-confirmation cancels (late confirm no-op, no execution); socket close disposes (existing teardown test updated); malformed payload does not kill the effect (existing catchError/defer posture — wrap projections in `defer` now, closing the P2-parked minor).
- [ ] **Step 2:** Implement; migrate the P2 choreography tests to the session shape (assert same sequences, now with `turnId`); full server suite green.
- [ ] **Step 3:** Commit `feat(server): per-connection agent sessions + availability + cancel + turnId echo`.

### Task 5: Persona + runner config

**Files:** `packages/server/src/agent/jarvisPersona.ts`, `jarvisRunnerConfig.ts`, tests.

`jarvisPersona.ts` exports `JARVIS_SYSTEM_PROMPT` — single string, the spec's register: capable, calm, slightly wry J.A.R.V.I.S-style butler ("sir"), no trademarked lines; states capabilities (quote/history/movers-by-history/blotter/analytics/service health/execute FX with mandatory confirmation) and limits (no standing subscriptions/sentinels yet — say so when asked; decline non-desk topics briefly); instructs terse replies (2–4 sentences), prices formatted to the pair's precision, and NEVER fabricating desk data — always read it through tools. `jarvisRunnerConfig.ts` exports the four cost-hygiene constants (Global Constraints) + `JARVIS_TOOL_FRIENDLY_NAMES: Record<string,string>` mapping tool names to the chip labels the UI shows (`get_price` → "quote", `get_blotter`/`get_analytics` → "desk", `get_price_history` → "history", `list_currency_pairs` → "refdata", `get_service_health` → "health", `execute_trade` → "trade").

- [ ] Steps: tests pin the constants' exact values and that the persona mentions confirmation-before-execution and no-fabrication (string containment — cheap drift guards); commit `feat(server): jarvis persona + runner cost-hygiene config`.

### Task 6: `AnthropicAgentLoop`

**Files:** `packages/server/src/agent/AnthropicAgentLoop.ts` + tests; `agentLoop.ts` gains the key branch (via the Task 4 parameter — `createAgentLoop` now passes the real builder); `packages/server/package.json` + lockfile gain `@anthropic-ai/sdk` (latest; run `pnpm outdated` to confirm freshness per repo dep policy).

**Design (binding):**

- Constructor takes `{ tools: readonly JarvisToolDefinition[], apiKey: string, runnerFactory?: RunnerFactory }` where `RunnerFactory` is the injection seam the tests fake: `(params: { model, system, tools, messages, max_tokens, stream }) => AsyncIterable<...>` shaped like the SDK's streaming tool runner. Production default builds `new Anthropic({ apiKey })` once per loop and calls `client.beta.messages.toolRunner({ ..., stream: true })` per turn.
- Per-session state: `messages` seeded from the wire `history` (mapped user/assistant, capped at `JARVIS_HISTORY_MAX_MESSAGES`), turn counter, in-flight `AbortController`.
- **Request shape:** `model: JARVIS_MODEL_ID`, `max_tokens: JARVIS_MAX_TOKENS_PER_TURN`, `system` as a block array with `cache_control: {type: "ephemeral"}` on the persona block (stable prefix: deterministic tool order — sort by name — then system, then messages; per current guidance the minimum cacheable prefix on this model is 512 tokens, so the persona+tools prefix caches), omit `thinking` (adaptive by default on this model), no `temperature`.
- **Event mapping** (streaming runner; per iteration stream): `content_block_start` of `tool_use` → `{type:"toolEvent", tool: friendlyName, status:"running"}`; block stop of that tool_use → status `"done"`; `text_delta` → `{type:"delta", text}`; iteration end without tool calls → final; after the runner completes → `{type:"done"}`. `stop_reason: "refusal"` → `{type:"error", message: "I'm afraid I can't assist with that, sir."}`. SDK/network errors → single `{type:"error", message: "The desk link faltered, sir — do try again."}` (never leak error internals or the key). `max_tokens` stop → append a truncation notice delta then done.
- **`execute_trade` confirm gate:** the session provides the `ConfirmGate` when building tools: it pushes `confirmRequest` (id `confirm-${crypto.randomUUID()}`, details from the gate's input) into the current turn's event stream and awaits an id-keyed resolver that `resolveConfirmation` fulfils — same Subject discipline as the engine (teardown cancels: EmptyError → gate resolves `false`).
- **Caps:** turn counter > `JARVIS_MAX_TURNS_PER_SESSION` → immediate scripted-style error event ("We've had quite the session, sir — do reconnect for a fresh one."), no API call. `cancelTurn()` aborts the controller → runner iteration ends → single error event ("Cancelled, sir.") unless the turn already completed.
- After each completed turn, append the assistant's final text (and the user's message) to session history, then trim from the front to the cap.

- [ ] **Step 1 (TDD):** With a fake runner factory scripted to yield: (a) text-only turn → deltas reassemble + done + history grows by 2; (b) tool-use turn (get_price) → toolEvent running/done bracketing, tool `run` actually invoked with parsed input, result fed back to the fake runner; (c) execute_trade turn → confirmRequest surfaces, approve → gate resolves true → tool result reports fill; decline → "user declined" result reaches the model, no execution; (d) refusal stop_reason → butler-refusal error event; (e) thrown SDK error → single sanitized error event; (f) turn-cap breach → no runnerFactory invocation; (g) cancelTurn mid-stream → abort signalled + error event; (h) history cap trims oldest first.
- [ ] **Step 2:** Implement; verify against the REAL SDK types by compiling (typecheck is the witness that the runner-factory seam matches the SDK surface — if the SDK's runner signature diverges from the seam, adapt the default factory, not the tests' seam).
- [ ] **Step 3:** `createAgentLoop` env-precedence test gains the key branch (fake builder observed). Full server suite + gates. Commit `feat(server): AnthropicAgentLoop — claude-opus-5 tool-runner sessions behind the AgentLoop seam`.

### Task 7: Client — `WsJarvisAdapter` turn correlation, cancel, availability query

**Files:** `packages/client-core/src/adapters/WsJarvisAdapter.ts` + contract tests; `jarvisPort.ts` unchanged.

- `ask(text)`: generate `turnId = crypto.randomUUID()`; handlers filter frames to `payload.turnId === turnId` (strip `turnId` before forwarding — machine still sees pure `JarvisEvent`); send `JARVIS_CHAT {text, turnId, history}` where `history` comes from a new constructor-injected `historySnapshot: () => readonly JarvisHistoryEntry[]` (default `() => []`); on teardown/offline-timeout ALSO send `JARVIS_CANCEL {turnId}` (fire-and-forget). This closes the P2 post-timeout-straggler limitation — stragglers no longer match the new turn's id; delete the accepted-limitation comment and its doc trail.
- New `availability$(): Observable<boolean>`: on subscribe, register the `JARVIS_AVAILABILITY` handler, send `JARVIS_SUBSCRIBE`, emit payload.available; re-query on each (re)subscribe; 10s first-event timeout → emit `false` (offline server = unavailable).
- **`historySnapshot` wiring:** `portFactory.createWsRealPorts` passes a snapshot function reading the machine's… the machine is built AFTER ports. Break the cycle with the same late-binding trick the factory uses elsewhere (check how `createInstantReveal$` threads preferences): the adapter takes a mutable setter — `setHistorySource(fn)` — and `composition.ts` calls it after machines are built, sourcing the last `JARVIS_HISTORY_MAX * 2` entries from `presenters.jarvis.state$` (text of done entries, role-mapped). If composition inspection shows a cleaner existing seam for this (a machines-to-adapters backchannel), use it and document; the constraint is only that machine/UI public surfaces stay unchanged for this task.

- [ ] Steps (TDD against FakeWsAdapter): turnId on the chat frame; frames with a WRONG turnId are ignored (the straggler regression test — turn A's late delta does not reach turn B); cancel frame on unsubscribe and on offline-timeout; history included when the source is set; availability true/false/timeout paths; then implementation; client-core suite + gates. Commit `feat(client-core): turn-correlated WsJarvisAdapter + cancel + availability query`.

### Task 8: Machine availability (sim always available)

**Files:** `packages/client-core/src/presenters/JarvisMachine.ts` + tests, `portFactory.ts`, `composition.ts` (deps threading).

`JarvisDeps` gains `availability$?: Observable<boolean>` (default `of(true)` — simulator mode and any legacy caller). `JarvisState` gains `readonly available: boolean` (INITIAL `true`; folded from `availability$`). No other machine behavior changes; `send` while unavailable is a no-op patch. `createWsRealPorts`'s machine wiring passes the adapter's `availability$()`.

- [ ] Steps (TDD, TestScheduler like existing machine tests): availability folds; default true; unavailable send no-op. Verify ui-contract world compiles (FakeJarvisPort untouched — availability comes via deps default). Both clients' contract tiers must stay green UNCHANGED in this task (the UI doesn't read `available` yet). Commit `feat(client-core): jarvis availability in machine state (sim defaults available)`.

### Task 9: Orb hides when unavailable (both clients + specs)

**Files:** both `JarvisOrb.tsx` shells (or their mount point in the header — render nothing when `!state.available`), `useJarvisHotkey` gating (hotkey no-op when unavailable), shared ui-contract specs (+2: orb absent when unavailable; hotkey inert), pages if a helper is needed.

- [ ] Steps: TDD via the shared contract specs against BOTH frameworks (swap-trio); default/available states pixel-identical — run one react visual pass on the jarvis scenarios locally and assert zero diffs (fixtures all have `available: true` by virtue of the state default — add `available: true` to the ui-contract jarvis fixtures explicitly since `JarvisState` gained a field and fixtures are exhaustive object literals); NO golden regen expected — if any jarvis golden diffs, stop and investigate before regenerating. Both contract tiers + coverage bars green. Commit `feat(ui): jarvis orb hidden when the server reports jarvis unavailable`.

### Task 10: Env plumbing + live smoke script + fullstack guard

**Files:** `turbo.json` (`ANTHROPIC_API_KEY` into `globalPassThroughEnv` — passthrough only; NEVER baked into any script), `scripts/jarvis-live-smoke.ts` (tsx script: boots the real server with the key from the caller's env on a scratch port, opens a raw WS + login like `tests/fullstack/node-smoke`, runs one quote turn + one declined trade turn, prints the streamed events; refuses to start without `ANTHROPIC_API_KEY`), root `package.json` script `jarvis:smoke:live`, `tests/fullstack/browser/fullstack.spec.ts` (+1 assertion in the existing jarvis test: the orb is visible — availability handshake proof under FAKE=1).

- [ ] Steps: grep-verify the key appears ONLY in `turbo.json` + the smoke script + docs; fullstack tier re-run green; the live smoke is NOT wired into any CI workflow (verify by grepping `.github/workflows`). Commit `chore(dev): ANTHROPIC_API_KEY passthrough + manual live-smoke script`.

### Task 11: Docs close-out

**Files:** `docs/architecture/18-jarvis-ai-agent-surface.md` (header status + new §18.13 "Phase 3 shipped — the real loop": the agent-tools package shape, the session-factory seam, per-connection history, the confirm-gate DI, cost hygiene, availability, turnId/cancel hardening closing P2's accepted limitations, the FAKE fallback doctrine, model choice note — spec said `claude-opus-4-8`, shipped `claude-opus-5` per current API guidance), `docs/architecture/06` + `13` + root `CLAUDE.md` (package tables + dep graph gain `@rtc/agent-tools`; server deps gain `@anthropic-ai/sdk`), `docs/STATUS.md` (Jarvis entry: P3 shipped; NEXT → P4 MCP; note the deployed-server key decision — Fly can stay on `RTC_JARVIS_FAKE=1` or gain `ANTHROPIC_API_KEY` as a user-approval action; `get_app_context` deferral logged), plan Task-4-style corrections if any adjudications changed prose.

- [ ] Steps: write; `pnpm check:doc-links`; commit `docs(jarvis): §18.13 phase-3 receipt + STATUS advance to P4`.

---

## Self-review notes (already applied)

- **Spec coverage vs parent §3.2–3.3/§4/§6:** 7 of 8 tools ✓ (`get_app_context` DEFERRED: it depends on a client→server app-context channel the chat payload doesn't carry and the UI doesn't yet produce; logged in STATUS rather than half-shipped); session-per-connection ✓ (via the per-socket effect invocation — verified against `createWsListener` source); tool-runner loop ✓ (streaming, model updated from the spec's dated `claude-opus-4-8` to `claude-opus-5` per current API guidance — recorded in §18.13); confirm flow through the existing card ✓ (ConfirmGate DI); persona ✓; cost hygiene ✓ (all four caps); env table ✓ (FAKE-wins precedence documented — the spec left the both-set case undefined; rehearsal-override chosen so a demo fallback is one env var away without unsetting the key); availability gating ✓; testing strategy ✓ (no API in CI; fake loop doubles as demo fallback; live smoke manual).
- **P2 deferrals closed:** turn correlation (turnId) ✓, cancel frame ✓ (server-parked confirmations now cancellable pre-socket-close), payload validation + shared payload types ✓ (Task 3/4), eager-projection minor ✓ (defer-wrapped in Task 4). RN `crypto.randomUUID` caveat: unchanged (client adapter uses it too — browser-only today; noted for any future RN Jarvis surface).
- **Type consistency:** `JarvisHistoryEntry` defined once (shared) and consumed by agent-tools? NO — agent-tools never sees history (loop concern); only shared/server/client-core import it. `AgentSession.runTurn(text, history)` signature consistent across Tasks 4/6/7. `ConfirmGate` lives in agent-tools (the tool needs the type); server imports it from there — dependency direction: server → agent-tools ✓ allowed (add to server deps + dep-cruiser).
- **The risky tasks:** Task 6 (SDK-surface fidelity — mitigated by the runner-factory seam + compile-witness) and Task 7's history back-channel (mitigated by explicitly allowing the implementer to substitute a cleaner existing seam under a stated invariant).
