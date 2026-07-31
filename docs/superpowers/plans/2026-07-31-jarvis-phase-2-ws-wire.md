# Jarvis Phase 2 — WS Wire + Server ScriptedAgentLoop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Jarvis brain server-side behind the `JARVIS_*` wire protocol: a `ScriptedAgentLoop` on the server (gated by `RTC_JARVIS_FAKE=1`) streams the same scripted turns over WebSocket, and a new `WsJarvisAdapter` replaces `ScriptedJarvisAdapter` in ws-real mode — with **zero changes to `JarvisMachine`, the UI trees, or the shared contract specs**.

**Architecture:** The P1 scripted brain (intent cascade + turn engine) relocates from `@rtc/client-core` to `@rtc/shared` (`src/jarvis/`), the one package both `client-core` and `server` may import — its event union was designed to mirror the wire messages, so the same engine now powers three consumers: the client's sim-mode adapter (thin wrapper, unchanged import surface), the server's `ScriptedAgentLoop` (engine over the server's services, which ARE the domain simulators implementing the same port interfaces), and the wire DTOs themselves. `WsJarvisAdapter` is a pure message↔event mapper with a first-event timeout. The `AgentLoop` seam in `packages/server/src/agent/` is where P3's `AnthropicAgentLoop` will slot in.

**Tech Stack:** TypeScript, RxJS, `@rtc/ws-effects` (`stream`/`out`), the existing `WsAdapter`/`IWsAdapter` client transport, vitest, Playwright (fullstack tier).

**Parent spec (authoritative for P2–P4):** [../specs/2026-07-12-jarvis-ai-assistant-design.md](../specs/2026-07-12-jarvis-ai-assistant-design.md) §3.3, §4, §6. P1 receipt: [../../architecture/18-jarvis-ai-agent-surface.md](../../architecture/18-jarvis-ai-agent-surface.md) §18.11.

## Global Constraints

- **`@rtc/domain` stays byte-identical.** No new domain types, ports, or exports. The headline of the whole workstream.
- **`JarvisMachine`, both UI trees, `@rtc/ui-contract` specs, and the visual goldens must not change.** The P1 event union already matches the wire; if a task finds itself editing `JarvisMachine.ts` or anything under `src/ui/shell/jarvis/`, the design has been violated — stop and escalate.
- **Dependency rule:** `shared` may depend on `domain` + `@rtc/motion-core` (new, this plan — motion-core is a zero-runtime-dep leaf; update dep-cruiser + CLAUDE.md + arch §6 in the same task that adds the edge). `server` depends on `domain`, `shared`, `ws-effects` — never `client-core`. `client-core` depends on `domain`, `shared`.
- **Wire messages are additive.** Existing clients/servers ignore unknown types. Message string prefixes: `jarvis.*`.
- **All P1.1 behaviors carry over verbatim into the relocated engine:** `EXECUTION_TIMEOUT_MS = 30_000` vs `SNAPSHOT_TIMEOUT_MS = 2_000`; the spread turn's `quote` toolEvent; `turnConfirmationIds` teardown (a torn-down turn cancels its pending confirmation Subject); `ratePrecision` on `confirmRequest`; the atomic `parseNotional` regex (CodeQL `js/polynomial-redos` stays closed); the U+2212 movers minus. The relocation is a MOVE, not a rewrite — `git mv` the files and keep their tests passing.
- **No API keys, no network calls in CI.** P2 has no Anthropic client at all; `RTC_JARVIS_FAKE=1` is the only way Jarvis effects register.
- **Accepted P2 constraints (documented, not bugs — do not "fix" them):**
  - No availability handshake: the orb renders in ws mode even against a server without `RTC_JARVIS_FAKE`; the `WsJarvisAdapter` first-event timeout (10 s) degrades a dead turn into a single `error` event ("Jarvis is offline, sir — the desk link is down."). Availability gating arrives with P3's key detection.
  - No turn correlation ids: `JarvisMachine` serializes turns (`concatMap`) and `WsJarvisAdapter.ask()` completes on `done`/`error`, so at most one turn is in flight per connection.
  - Ws-mode ignores `instantReveal$`: the server always paces deltas (it cannot know client motion prefs; P3's real token stream behaves the same way). Sim mode keeps instant-reveal — contract specs and the powerSaver e2e run sim mode and are unaffected.
- **Repo gates:** `rtc/name-functions-by-effect` (effect-verb names; slots exempt), Biome `ci` form (format + import-sort), `padding-line-between-statements`, `func-style` (declarations, not arrow consts), no inline-object type args, newspaper order, `#/` subpath aliases, mandatory braces. Run `/rtc:gauntlet` locally per phase.
- **Ship under `shipping-repo-changes`:** worktree off `origin/main`, one PR, CI green for the exact SHA (`gh run list`, never `gh pr checks`), merge with `--merge`.

## File Structure

```
packages/shared/src/jarvis/                      (NEW — the relocated brain + wire DTOs)
  jarvisEvent.ts        JarvisEvent union (moved from client-core/adapters/jarvisPort.ts)
  jarvisIntent.ts       intent cascade + parseNotional (moved verbatim from client-core)
  ScriptedJarvisEngine.ts  the turn engine (extracted from ScriptedJarvisAdapter; ask/confirm surface)
  index barrel additions in packages/shared/src/index.ts
packages/shared/src/protocol/messages.ts         (+2 CLIENT_MSG, +5 SERVER_MSG)
packages/server/src/agent/                       (NEW)
  agentLoop.ts          AgentLoop interface + createAgentLoop(env, ctx) selection
  ScriptedAgentLoop.ts  engine over the ServiceContainer services
packages/server/src/effects/jarvis.effects.ts    (NEW) chat + confirm effects
packages/server/src/effects/index.ts             conditional registration
packages/server/src/index.ts                     env read + loop construction
packages/client-core/src/adapters/jarvisPort.ts  JarvisPort stays; JarvisEvent re-exported from shared
packages/client-core/src/adapters/ScriptedJarvisAdapter.ts  thin wrapper over the shared engine
packages/client-core/src/adapters/WsJarvisAdapter.ts        (NEW) wire → JarvisEvent mapper
packages/client-core/src/adapters/portFactory.ts jarvis: ws-real branch swaps to WsJarvisAdapter
package.json scripts (dev:ws, dev:*:fs) + turbo.json dev env  RTC_JARVIS_FAKE plumbing
tests/fullstack/_orchestration.ts + browser/fullstack.spec.ts  jarvis smoke
docs: architecture/18 (§18.12 P2), architecture/06 + CLAUDE.md (dep edges), STATUS.md
```

**Task order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Tasks 3–4 (server) and 5–6 (client) both depend on 1–2 but not on each other.

---

### Task 1: `JARVIS_*` wire vocabulary in `@rtc/shared`

**Files:**
- Modify: `packages/shared/src/protocol/messages.ts`
- Create: `packages/shared/src/jarvis/jarvisEvent.ts`
- Modify: `packages/shared/src/index.ts` (export the new module)
- Test: `packages/shared/src/protocol/messages.test.ts` (follow its existing pattern)

**Interfaces:**
- Produces: `CLIENT_MSG.JARVIS_CHAT` = `"jarvis.chat"`, `CLIENT_MSG.JARVIS_CONFIRM` = `"jarvis.confirm"`; `SERVER_MSG.JARVIS_DELTA` = `"jarvis.delta"`, `SERVER_MSG.JARVIS_TOOL_EVENT` = `"jarvis.toolEvent"`, `SERVER_MSG.JARVIS_CONFIRM_REQUEST` = `"jarvis.confirmRequest"`, `SERVER_MSG.JARVIS_DONE` = `"jarvis.done"`, `SERVER_MSG.JARVIS_ERROR` = `"jarvis.error"`.
- Produces: `JarvisEvent` (moved verbatim from `client-core/src/adapters/jarvisPort.ts` — the five-variant union incl. `ratePrecision` on `confirmRequest`), plus payload DTO aliases `JarvisChatPayload { readonly text: string }` and `JarvisConfirmPayload { readonly confirmationId: string; readonly approved: boolean }`.

- [ ] **Step 1:** Write a failing test asserting the seven new message constants exist with the exact strings above (mirror how `messages.test.ts` pins existing constants).
- [ ] **Step 2:** Run it — FAIL (constants undefined).
- [ ] **Step 3:** Add the constants (client pair under a `// Jarvis` comment group, server five likewise) and create `jarvis/jarvisEvent.ts` with the `JarvisEvent` union + the two payload interfaces. The wire rule, stated in the file's doc comment: *each `SERVER_MSG.JARVIS_*` payload IS the matching `JarvisEvent` variant minus its `type` discriminant (the message type carries it)*.
- [ ] **Step 4:** Export from `packages/shared/src/index.ts`; run the shared test suite — PASS.
- [ ] **Step 5:** Commit `feat(shared): JARVIS_* wire vocabulary + JarvisEvent moves to shared`.

*(client-core still compiles because nothing imports the shared copy yet — the switchover is Task 2.)*

### Task 2: Relocate the scripted brain to `@rtc/shared`

**Files:**
- Create: `packages/shared/src/jarvis/jarvisIntent.ts` (git mv from `packages/client-core/src/adapters/jarvisIntent.ts`, verbatim)
- Create: `packages/shared/src/jarvis/ScriptedJarvisEngine.ts` (the body of today's `ScriptedJarvisAdapter`, renamed)
- Create: `packages/shared/src/jarvis/__tests__/` (git mv the two test files: `jarvisIntent.test.ts`, `ScriptedJarvisAdapter.test.ts` → `ScriptedJarvisEngine.test.ts`)
- Modify: `packages/client-core/src/adapters/jarvisPort.ts` — `JarvisPort` interface stays; `JarvisEvent` becomes `export type { JarvisEvent } from "@rtc/shared"` (re-export keeps every existing import site working)
- Modify: `packages/client-core/src/adapters/ScriptedJarvisAdapter.ts` — thin subclass/alias: `export class ScriptedJarvisAdapter extends ScriptedJarvisEngine {}` plus `export type { ScriptedJarvisDeps }` re-export
- Modify: `packages/shared/package.json` (+ `@rtc/motion-core` dependency), `.dependency-cruiser.cjs` (allow `shared → motion-core`), `tsconfig.depcruise.json` pair if shared's jarvis dir needs it, root `CLAUDE.md` + `docs/architecture/06-package-dependencies.md` (the motion-core consumer list gains `@rtc/shared` for `speechChunks`)

**Interfaces:**
- Produces: `ScriptedJarvisEngine` implementing exactly today's surface — `constructor(deps: ScriptedJarvisDeps)`, `ask(text: string): Observable<JarvisEvent>`, `confirm(confirmationId: string, approved: boolean): void` — where `ScriptedJarvisDeps` = `{ referenceData: ReferenceDataPort; pricing: PricingPort; blotter: BlotterPort; analytics: AnalyticsPort; execution: ExecutionPort; instantReveal$: Observable<boolean> }` (all domain port types; unchanged).
- Consumes: Task 1's `JarvisEvent` from `#/jarvis/jarvisEvent`.

- [ ] **Step 1:** `git mv` the intent module + tests into shared; move the adapter body into `ScriptedJarvisEngine.ts` (class renamed, everything else — constants, timeouts, `cancelConfirmation`, `turnConfirmationIds`, reply copy, comments — verbatim). Fix `#/` import paths for the new package.
- [ ] **Step 2:** Add the `@rtc/motion-core` dep to shared (workspace protocol, same version pattern as client-core's) + the dep-cruiser allowance. Run `pnpm check:deps` — must pass.
- [ ] **Step 3:** Reduce client-core's two files to the re-export shims above. `pnpm typecheck` — PASS (ui-contract, machine tests, portFactory all still resolve `ScriptedJarvisAdapter`/`JarvisEvent` from client-core unchanged).
- [ ] **Step 4:** Run the moved test suites in shared AND the untouched client-core Jarvis suites (`JarvisMachine.test.ts`, `composition.jarvis.test.ts`) — all PASS. The moved engine tests are the proof the move is behavior-preserving.
- [ ] **Step 5:** Update the CLAUDE.md package-table line for `shared` ("+ the transport-neutral scripted Jarvis brain (`src/jarvis/`), shared by the sim-mode client adapter and the server's ScriptedAgentLoop") and arch §6's motion-core consumer list. `pnpm check:doc-links` — PASS.
- [ ] **Step 6:** Commit `refactor(jarvis): relocate the scripted brain to @rtc/shared (move, not rewrite)`.

### Task 3: Server `AgentLoop` seam + `ScriptedAgentLoop`

**Files:**
- Create: `packages/server/src/agent/agentLoop.ts`
- Create: `packages/server/src/agent/ScriptedAgentLoop.ts`
- Test: `packages/server/src/agent/ScriptedAgentLoop.test.ts`

**Interfaces:**
- Produces:

```ts
// agentLoop.ts
import type { Observable } from "rxjs";
import type { JarvisEvent } from "@rtc/shared";

/** The P3 seam: AnthropicAgentLoop implements this same surface. */
export interface AgentLoop {
  runTurn(text: string): Observable<JarvisEvent>;
  resolveConfirmation(confirmationId: string, approved: boolean): void;
}

/** RTC_JARVIS_FAKE=1 → scripted loop; otherwise Jarvis is absent (effects
 * not registered). P3 adds the ANTHROPIC_API_KEY branch here. */
export function createAgentLoop(
  env: NodeJS.ProcessEnv,
  services: ServiceContainer,
): AgentLoop | null;
```

- `ScriptedAgentLoop` wraps `ScriptedJarvisEngine` over the container: `new ScriptedJarvisEngine({ referenceData: services.referenceData, pricing: services.pricing, blotter: services.blotter, analytics: services.analytics, execution: services.execution, instantReveal$: of(false) })` — the services ARE the domain simulators, so the deps line up 1:1. `runTurn` = `engine.ask`; `resolveConfirmation` = `engine.confirm`. (`of(false)`: the server always paces deltas.)
- Consumes: Task 2's engine; `ServiceContainer` from `../services/serviceContainer.js`.

- [ ] **Step 1:** Failing tests: (a) `createAgentLoop({}, services)` → `null`; (b) `createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services)` → a loop whose `runTurn("what can you do?")` emits paced deltas reassembling the help reply then completes; (c) a `runTurn("buy 5M EURUSD")` emits a `confirmRequest`, `resolveConfirmation(id, true)` executes through the container's `ExecutionSimulator`, and the fill lands in `services.blotter`'s trade stream (subscribe and assert the trade count grows).
- [ ] **Step 2:** Run — FAIL. Implement the two files. Use vitest fake timers exactly as the moved engine tests do (the pacing + EURJPY 4 s fill delay live behind timers).
- [ ] **Step 3:** Run — PASS. Commit `feat(server): AgentLoop seam + ScriptedAgentLoop over the service container`.

### Task 4: Server `jarvis.effects.ts` + gated registration

**Files:**
- Create: `packages/server/src/effects/jarvis.effects.ts`
- Modify: `packages/server/src/effects/index.ts`, `packages/server/src/index.ts`
- Test: `packages/server/src/effects/jarvis.effects.test.ts` (mirror `fx.effects.test.ts`'s harness)

**Interfaces:**
- Produces: `jarvisEffects(loop: AgentLoop): WsEffect<Ctx>[]` — a factory, not a constant, because the effects close over the loop instance:

```ts
const jarvisChat$ = stream(CLIENT_MSG.JARVIS_CHAT, (payload) => {
  const { text } = payload as JarvisChatPayload;
  return loop.runTurn(text).pipe(
    map((event): Outbound => {
      const { type, ...body } = event;
      return out(WIRE_TYPE_BY_EVENT[type], body);
    }),
  );
});
// WIRE_TYPE_BY_EVENT: delta→JARVIS_DELTA, toolEvent→JARVIS_TOOL_EVENT,
// confirmRequest→JARVIS_CONFIRM_REQUEST, done→JARVIS_DONE, error→JARVIS_ERROR.

const jarvisConfirm$ = stream(CLIENT_MSG.JARVIS_CONFIRM, (payload) => {
  const { confirmationId, approved } = payload as JarvisConfirmPayload;
  loop.resolveConfirmation(confirmationId, approved);
  return EMPTY;
});
```

- Registration: `effects/index.ts` gains `export function buildEffects(loop: AgentLoop | null): WsEffect<Ctx>[]` returning `allEffects` plus `...jarvisEffects(loop)` when `loop` is non-null; `server/src/index.ts` calls `createAgentLoop(process.env, services)` once and passes the result through. Keep `allEffects` exported for any test that uses it today.
- Consumes: Task 1's constants + payload types, Task 3's `AgentLoop`.

- [ ] **Step 1:** Failing choreography tests, driving the effects with an `Inbound` stream the way `fx.effects.test.ts` does: (a) `jarvis.chat` ("where is EURUSD?") → outbound sequence `jarvis.toolEvent(running)` … `jarvis.delta`× … `jarvis.toolEvent(done)` … `jarvis.done`, with the deltas reassembling the quote reply; (b) trade turn → `jarvis.confirmRequest` (payload has `confirmationId`, `symbol`, `direction`, `notional`, `quotedPrice`, `ratePrecision`, no `type` field) → send `jarvis.confirm {approved: true}` → fill reply + `jarvis.done`, trade visible in the container blotter; (c) `{approved: false}` → declined copy; (d) tearing down the chat stream mid-confirmation then confirming is a no-op (no execution) — the engine's `turnConfirmationIds` teardown, proven at the wire layer.
- [ ] **Step 2:** Run — FAIL. Implement effects + registration + the env read in `index.ts`.
- [ ] **Step 3:** Run the full server suite — PASS. Commit `feat(server): JARVIS_* wire effects behind RTC_JARVIS_FAKE`.

### Task 5: Client `WsJarvisAdapter`

**Files:**
- Create: `packages/client-core/src/adapters/WsJarvisAdapter.ts`
- Test: `packages/client-core/src/adapters/wsRealJarvis.contract.test.ts` (mirror the `wsRealExecution.contract.test.ts` fake-adapter pattern)

**Interfaces:**
- Produces: `class WsJarvisAdapter implements JarvisPort { constructor(ws: IWsAdapter) }`.
- `ask(text)`: cold Observable; on subscribe it registers `ws.on(...)` handlers for the five `SERVER_MSG.JARVIS_*` types (each handler re-attaches the `type` discriminant and forwards the `JarvisEvent`; `done`/`error` also complete), THEN `ws.send(CLIENT_MSG.JARVIS_CHAT, { text })` — handler-before-send so a same-tick reply can't be missed (the `WsAdapter` buffers pre-open sends, so this also works while the socket is still connecting). A `timeout({ first: JARVIS_FIRST_EVENT_TIMEOUT_MS })` (10 000; exported) maps a silent server into one synthetic `{ type: "error", message: "Jarvis is offline, sir — the desk link is down." }` + complete — never a thrown error. Teardown unregisters all five handlers.
- `confirm(confirmationId, approved)`: `ws.send(CLIENT_MSG.JARVIS_CONFIRM, { confirmationId, approved })` — fire-and-forget, matching the port's `void` signature.
- Consumes: `IWsAdapter` (`on`/`send`), Task 1's constants + `JarvisEvent`.

- [ ] **Step 1:** Failing contract tests with the fake ws adapter: (a) `ask` sends `jarvis.chat {text}` after handlers are attached; (b) injected `jarvis.delta`/`jarvis.toolEvent`/`jarvis.done` frames surface as the corresponding `JarvisEvent`s and the observable completes on `done`; (c) `jarvis.confirmRequest` payload surfaces with all six fields incl. `ratePrecision`; (d) `confirm()` sends the right frame; (e) fake timers: no server frame for 10 s → exactly one `error` event with the offline copy, then complete; (f) unsubscribe detaches the handlers (a later injected frame emits nothing).
- [ ] **Step 2:** Run — FAIL. Implement. — PASS.
- [ ] **Step 3:** Commit `feat(client-core): WsJarvisAdapter — the wire-mode JarvisPort`.

### Task 6: Port-factory swap (ws-real mode only)

**Files:**
- Modify: `packages/client-core/src/adapters/portFactory.ts` (the `createWsRealPorts` jarvis line only — the simulator factory keeps `ScriptedJarvisAdapter`)
- Test: extend `packages/client-core/src/adapters/portFactory.test.ts` / the wsReal factory test

**Interfaces:**
- Consumes: Task 5's `WsJarvisAdapter`; the factory's existing `ws` instance.

- [ ] **Step 1:** Failing test: `createWsRealPorts(...)` yields `ports.jarvis instanceof WsJarvisAdapter`; `createSimulatorPorts(...)` yields `ScriptedJarvisAdapter` (pin both so a future edit can't silently flip a mode).
- [ ] **Step 2:** Swap the ws-real construction to `new WsJarvisAdapter(ws)` (delete that factory's now-unused scripted deps wiring for jarvis). Run client-core suite + `pnpm typecheck` — PASS.
- [ ] **Step 3:** Run both clients' contract tiers (they use the fake port — must be untouched): `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract` — PASS, same spec counts as before this plan.
- [ ] **Step 4:** Commit `feat(client-core): ws-real mode speaks JARVIS_* — WsJarvisAdapter wired in the port factory`.

### Task 7: Env plumbing (`RTC_JARVIS_FAKE`)

**Files:**
- Modify: root `package.json` (`dev:ws`, `dev:react:fs`, `dev:solid:fs`, `dev:ios:fs` — add `RTC_JARVIS_FAKE=1` alongside the baked `AUTH_USERS`), `turbo.json` (add `RTC_JARVIS_FAKE` to the `dev` task's `env`/`globalPassThroughEnv` list — turbo's strict env mode silently strips undeclared vars, which would drop the server loop with no error), `tests/fullstack/_orchestration.ts` (add `RTC_JARVIS_FAKE: "1"` to the spawned server env).

- [ ] **Step 1:** Make the three edits. Grep-verify: `grep -n "RTC_JARVIS_FAKE" package.json turbo.json tests/fullstack/_orchestration.ts` shows all sites.
- [ ] **Step 2:** Manual smoke (documented, not automated): `pnpm dev:react:fs`, sign in, open Jarvis, ask "where is EURUSD?" — reply streams from the server (verify in the devtools wire lens or the network tab: `jarvis.delta` frames).
- [ ] **Step 3:** Commit `chore(dev): RTC_JARVIS_FAKE=1 baked into dev:ws / *:fs + turbo env declaration`. Note in the PR body: the deployed Fly server needs `fly secrets set RTC_JARVIS_FAKE=1` once (dispatch-only deploy; user-approval action).

### Task 8: Fullstack e2e smoke

**Files:**
- Modify: `tests/fullstack/browser/fullstack.spec.ts` (new `test.describe`), reusing the existing login-seed `beforeEach`.

- [ ] **Step 1:** Write the smoke: open the app (ws-real mode against the real spawned server), open Jarvis (click the orb via its P1 testid), send "where is EURUSD?" — expect the last reply entry to contain "EURUSD is trading at" (timeout 20 s; the reply streams). Then send "buy 5M EURUSD", await the confirm card testid, approve, and assert the reply contains "the trade is on your blotter" — the whole browser → WS → server-brain → real execution → wire → UI chain in one spec.
- [ ] **Step 2:** Run the fullstack tier the way its script does (see `tests/fullstack/browser-smoke.ts`) — PASS. If the tier isn't in PR CI, run it locally and paste the output into the PR body.
- [ ] **Step 3:** Commit `test(fullstack): jarvis chat + confirm-gated execution over the real wire`.

### Task 9: Docs + STATUS close-out

**Files:**
- Modify: `docs/architecture/18-jarvis-ai-agent-surface.md` (new §18.12 "Phase 2 shipped — the wire": what moved where, the three-consumers diagram of the shared engine, the accepted constraints list, the P3 seam), `docs/STATUS.md` (Jarvis entry: P2 shipped; NEXT: P3 `@rtc/agent-tools` + Anthropic loop), CLAUDE.md/arch §6 lines if not already done in Task 2.

- [ ] **Step 1:** Write §18.12; update STATUS (pending-only doctrine: P2 lines out, P3 becomes NEXT). `pnpm check:doc-links` — PASS.
- [ ] **Step 2:** Commit `docs(jarvis): §18.12 phase-2 wire + STATUS advance to P3`.

---

## Self-review notes (already applied)

- **Spec coverage vs parent spec §3.3:** turn choreography ✓ (Task 4), confirm round-trip incl. decline + teardown ✓ (Tasks 3–5), `RTC_JARVIS_FAKE` gate ✓ (Tasks 3/7), fake-loop-as-demo-fallback ✓ (same engine everywhere). Deferred to P3 by design: `appContext` on `JARVIS_CHAT`, availability gating, session history, `AnthropicAgentLoop`, `@rtc/agent-tools`, MCP (P4).
- **Type consistency:** `JarvisEvent` has exactly one definition (shared) after Task 2; `ScriptedJarvisDeps` name reused unchanged; `AgentLoop.resolveConfirmation` deliberately ≠ `JarvisPort.confirm` (different seam, effect-named).
- **The one risky task is Task 2** (the move): its safety net is that the moved tests must pass unmodified except for import paths, and client-core's re-export shims keep every downstream import site byte-compatible.
