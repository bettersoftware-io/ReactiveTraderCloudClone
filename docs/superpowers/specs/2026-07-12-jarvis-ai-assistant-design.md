# Jarvis — an AI singularity in the HUD (design spec, slice 1 + capability roadmap)

**Date:** 2026-07-12
**Status:** Approved design, pre-implementation-plan
**Depends on:** nothing new in `@rtc/domain` (that is the point — see §2)

## 0. Vision

The app is a Jarvis-style sci-fi trading HUD. This workstream adds Jarvis itself: a
pulsating, alive-feeling AI presence in the shell chrome that opens into a chat panel,
answers questions about the live market, and acts on the user's behalf — starting with
confirm-gated trade execution, growing toward standing sentinels, generative UI, and an
app that other AIs can operate.

Two goals, deliberately entangled:

1. **Product:** a genuinely astonishing demo — "I ask the app to trade, it consults its
   own blotter, proposes the trade, I confirm, it lands" — plus the external kicker:
   a colleague connects Claude Desktop/Claude Code to the app over MCP and trades from
   *their* AI, live, into the same blotter.
2. **Architecture:** the third-client proof. Web React and RN/Expo already share the
   framework-free core. An AI agent surface is the third head — and unlike SolidJS,
   it is not even a UI framework. If the dependency rule holds, this entire feature
   is adapters; §2 makes that argument explicit and §9 shows the counterfactual.

## 1. Brainstorm decisions (locked with user)

1. **First slice:** vertical — icon → chat panel → server agent loop → MCP tools.
   Sentinels, UI-driving, voice etc. are follow-up specs (§10 roadmap).
2. **Deployment:** local-only first. Agent loop runs in the local `@rtc/server` dev
   process with `ANTHROPIC_API_KEY` from env. Deploying to Fly is a follow-up (needs
   auth/rate-limit/budget hardening around the agent endpoint).
3. **MCP topology:** shared tool registry, two transports. Tools are defined once,
   framework-free; the in-process agent loop and a real MCP server both consume the
   same registry.
4. **Trade gating:** confirm-in-chat. `execute_trade` never runs without an explicit
   user confirmation (rich card in the chat timeline). Read tools run freely.
5. **Transport:** extend the existing WS protocol (`JARVIS_*` message types in the
   `CLIENT_MSG`/`SERVER_MSG` envelopes) — one connection, ws-effects on the server,
   a normal client-core machine on the client.

## 2. The thesis — why this feature is cheap here and nearly impossible elsewhere

This section is load-bearing. It states the claim this workstream exists to prove.

**Claim.** Every AI-era capability in this spec — agent tools, MCP exposure, an agent
driving the UI, LLM market participants, deterministic testing of an LLM feature —
falls out of the same handful of decisions this repo has enforced from day one:
business logic in framework-free use cases behind port interfaces, UI state in
machines instead of components, dependency inversion at a composition root, dumb UI,
and a test strategy (contract tier, goldens, injected fakes) built around those seams.
None of these decisions were made "for AI". AI is simply the first consumer to show up
that is *not a UI framework*, and the architecture doesn't care.

**The receipt, capability by capability:**

| Capability | The seam that makes it a bolt-on | The counterfactual in a typical hooks-era codebase |
|---|---|---|
| Agent tools over the domain (`execute_trade`, `get_blotter`, …) | Use cases are plain classes over injected ports (`ExecuteTradeUseCase(executionPort)`), callable from any process | Trading logic lives inside `onClick` handlers and `useEffect` chains; there is nothing callable to wrap. You either duplicate the logic server-side (drift) or headless-render React to "call" it |
| MCP server as a thin wrapper | Same registry, second transport; zero domain changes | The "API for the AI" becomes a rewrite of the app's behavior, permanently chasing the UI implementation |
| A *third client* (the agent) | `@rtc/client-core` has no React/DOM/RN imports; adding a consumer is additive | Logic captured in hooks is locked inside React's render lifecycle — unusable from a Node agent loop without React itself |
| Jarvis drives the UI (phase 2+) | All UI state is machines with explicit intents; an agent tool = dispatch an intent | State scattered across hundreds of `useState`/`useReducer` islands; no addressable surface for an agent to act on |
| LLM market participants (phase 3) | Dealers/pricing are simulators behind ports; swap in a `ClaudeDealerAdapter` | Mock data hardcoded inside components; a "smart counterparty" means rewriting the Credit tab |
| Deterministic tests + demo fallback for an LLM feature | The agent loop is itself behind a port; a scripted fake makes CI and offline demos deterministic | `fetch` to the LLM inline in components; tests mock the network globally and flake |
| Time-travel, self-introspection (phase 2+) | Event-shaped WS protocol, machines with explicit state, devtools observe bus (PR #168 spec) | State transitions are implicit in re-renders; there is no event log to replay or explain |

**On the "best practices" that ate the React world.** Somewhere after "rethinking best
practices", *colocation* stopped being a rendering argument and became a license to fuse
data fetching, business rules, and presentation into the component tree — fetch calls in
effects, domain logic in custom hooks coupled to render timing, state as a byproduct of
whatever happened to re-render. Each individual component "works". The system-level cost
is invisible until a new kind of consumer arrives — a second UI framework, a test tier,
or, decisively now, an AI agent — and there is no seam to attach it to. The missed
opportunity is not cleanliness; it is *capability*: every row of the table above is a
feature such a codebase simply cannot ship without a rewrite.

To the reviewer who said "SOLID is an antipattern", and the one who said "nobody at the
big shops does TDD or clean code": this repo is the experiment run to completion. The
same discipline dismissed as ceremony is why an AI assistant, an MCP surface, and a
framework swap are each *a package*, not a project. §10 is a list of a dozen
capabilities, and every one names the existing seam it plugs into. That is what the
discipline buys. This document is the receipt.

## 3. Slice-1 architecture

```
                    ┌──────────────────┐
                    │   @rtc/domain    │  (untouched in slice 1)
                    │    use cases     │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ @rtc/agent-tools │  tool registry — THE PORT
                    │  rxjs-only; no   │  { name, description,
                    │  AI-SDK imports  │    inputSchema (JSON Schema),
                    └───┬──────────┬───┘    handler(ctx) }
                        │          │
             ┌──────────▼──┐   ┌───▼──────────────┐
             │ Agent loop  │   │  MCP endpoint    │  both in @rtc/server,
             │ (Anthropic  │   │ (streamable HTTP,│  same serviceContainer
             │ tool runner)│   │  same process)   │  → same live state
             └──────┬──────┘   └───▲──────────────┘
                    │ JARVIS_* WS  │ Claude Desktop / Claude Code
             ┌──────▼───────┐     │ (external clients)
             │ JarvisMachine│
             │ (client-core)│
             └──────┬───────┘
             ┌──────▼───────┐
             │ icon + panel │  (client-react, dumb UI)
             └──────────────┘
```

### 3.1 `@rtc/agent-tools` — the new (11th) package

- Pure TS, runtime dep: `rxjs` only (same constraint as `domain`, `ws-effects`,
  `motion-core`).
- Exports `ToolDefinition` (`name`, `description`, `inputSchema` as **plain JSON
  Schema**, `handler(input, ctx): Promise<ToolResult>`) and the slice-1 registry.
- Handlers are written against a `ToolContext` of **domain use cases + ports** —
  never against server services, the Anthropic SDK, or MCP types.
- JSON-Schema-native on purpose: the Anthropic SDK's `betaTool()` accepts raw JSON
  Schema and the MCP adapter converts at the edge. No zod → no ecosystem coupling in
  the registry.
- Gated tools carry `gate: "confirmation"` metadata; *how* the gate is realized is
  transport-specific (§3.3, §3.5).

### 3.2 Slice-1 tool set (8 tools)

| Tool | Wraps | Access |
|---|---|---|
| `list_currency_pairs` | `CurrencyPairsUseCase` | read |
| `get_price` | `PriceStreamUseCase` — first-value snapshot | read |
| `get_price_history` | `PriceHistoryUseCase` | read |
| `get_blotter` | `TradeBlotterUseCase` (recent trades, filterable) | read |
| `get_analytics` | `AnalyticsUseCase` (positions, PnL) | read |
| `get_service_health` | service-health port data | read |
| `execute_trade` | `ExecuteTradeUseCase` | **gated** |
| `get_app_context` | tab/theme snapshot the client sends per turn | read |

Stream-vs-request convention: read tools take a snapshot (`firstValueFrom` + timeout)
of the relevant Observable. Standing subscriptions ("watch this price") are explicitly
out of scope until the sentinel phase; the system prompt tells Jarvis to say so.

### 3.3 Server — agent loop (`packages/server/src/agent/`)

- **Session:** one `JarvisSession` per WS connection; message history in memory, dies
  with the socket.
- **Loop:** Anthropic TypeScript SDK tool runner (`client.beta.messages.toolRunner`),
  model `claude-opus-4-8`, `thinking: {type: "adaptive"}`, streaming.
- **Injection seam:** the loop sits behind an `AgentLoop` interface chosen at the
  composition root. Implementations: `AnthropicAgentLoop` (real) and
  `ScriptedAgentLoop` (fake; `RTC_JARVIS_FAKE=1`) — deterministic replies, tool calls,
  and a confirm round-trip. CI and offline demos never touch the API.
- **Turn choreography** (all via existing ws-effects):
  1. `CLIENT_MSG.JARVIS_CHAT { text, appContext }`
  2. streamed back: `SERVER_MSG.JARVIS_DELTA` (text), `JARVIS_TOOL_EVENT`
     (`{tool, status: running|done}` — UI renders activity chips), then
     `JARVIS_DONE` (or `JARVIS_ERROR`).
- **Confirmation flow:** the `execute_trade` handler (agent-loop side) does **not**
  execute. It emits `SERVER_MSG.JARVIS_CONFIRM_REQUEST {confirmationId, pair,
  direction, notional, quotedPrice}` and awaits a promise.
  `CLIENT_MSG.JARVIS_CONFIRM {confirmationId, approved}` resolves it: approved → the
  real use case runs and the trade result returns to the model as the tool result;
  rejected or 60s timeout → tool result "user declined". The tool-runner's async
  handlers make this natural; no manual loop.
- **Persona:** single-file system prompt — capable, calm, slightly wry JARVIS register
  (no trademarked lines); states capabilities/limits; trades always need confirmation.
- **Cost hygiene (even local-only):** per-turn `max_tokens` cap, per-session turn cap,
  history trimming after N turns (no server-side compaction in slice 1 — sessions are
  short).

### 3.4 Server — MCP endpoint (`packages/server/src/mcp/`)

- Official `@modelcontextprotocol/sdk`, **Streamable HTTP transport mounted on the
  same HTTP server** the WS layer upgrades from (e.g. `/mcp`).
- In-process is a correctness decision, not convenience: a separate stdio process
  would own separate simulator instances and a *different blotter*. Same process ⇒
  a trade from Claude Desktop appears live in the running app.
- All 8 tools exposed. `execute_trade` is ungated at our layer for MCP: external
  clients enforce HITL through their own tool-approval surface (Claude Desktop/Code
  always ask before a write tool) — the architecturally honest layer for it.
- Auth: same shared-token header check as the WS layer; enabled by the same env gate.
- Demo: `claude mcp add --transport http rtc http://localhost:<port>/mcp`.

### 3.5 Client — machine + dumb UI

- **`JarvisMachine`** (`client-core/src/presenters/`, per ADR-005 this is an
  autonomous async fold → RxJS machine): state
  `{ open, availability, entries[], streamBuffer, pendingConfirmation,
  phase: idle|thinking }`; inputs = user intents (open/close/send/confirm/reject) +
  `JARVIS_*` server messages via the adapter.
- **`JarvisPort`** lives in `client-core/adapters` — deliberately *not* in
  `domain/ports`: chat is an application concern, and keeping `@rtc/domain`
  byte-identical is the headline.
- **Icon** (shell chrome, right cluster): layered orb — core glyph + two pre-rendered
  glow layers; animation is `transform: scale()` + `opacity` **only** (see
  [docs/performance.md](../../performance.md): no animated `filter`/`box-shadow`, no
  `var()` in animated transforms, one animation per property per element). States via
  `data-jarvis-state`: `idle` (slow 4s breath), `thinking` (faster/brighter),
  `attention` (confirm pending). Idle "random" flicker = long-period keyframe, not JS
  timers. Steady state must show zero `compositeFailed` events.
- **Panel:** right-side overlay, v4 design language (Orbitron chrome, holo-dot
  backdrop, SurfaceCard skin). Chat log, live-streaming assistant text, inline
  tool-activity chips ("⟢ consulting blotter…" → "✓ blotter"), and the confirm card:
  pair, BUY/SELL badge (FX-tile colors), notional, quoted price, Confirm/Reject,
  60s countdown ring. Dumb UI — no rxjs/fetch/localStorage in `src/ui` (grep gates).
- **Availability gating:** server reports Jarvis availability (key or fake-flag
  present); icon hidden otherwise.

## 4. Testing strategy (no API calls anywhere in CI)

- **`@rtc/agent-tools`:** vitest — every tool against stub use cases; JSON-schema
  validity; snapshot-timeout behavior.
- **Server:** ws-effects tests with `ScriptedAgentLoop` asserting the full
  `JARVIS_CHAT → DELTA/TOOL_EVENT/CONFIRM_REQUEST/DONE` wire choreography, both
  confirm outcomes, and the timeout. MCP tests with the MCP SDK client in-process:
  `tools/list`, a read call, `execute_trade` then visible in the blotter.
- **client-core:** `JarvisMachine` unit tests — streaming fold, confirm lifecycle
  incl. timeout, availability gating.
- **client-react:** UI contract specs (icon states, panel, confirm card) — keep the
  ≥95% contract-coverage gate green; run locally before merge.
- **e2e:** one Playwright smoke under `RTC_JARVIS_FAKE=1` — open panel, ask, streamed
  reply, confirm a trade, trade lands in the blotter. Runs in CI (no key needed).
- **Manual/live:** a `scripts/` real-key conversation smoke; Claude Code as the
  external MCP client for the two-transports demo.
- The fake agent doubles as the **demo fallback**: key missing or API down five
  minutes before showtime → `RTC_JARVIS_FAKE=1` still gives a streaming,
  confirm-card-included Jarvis.

## 5. New-package gates checklist

Wiring `@rtc/agent-tools` (from the all-gates-global rule): root typecheck refs, knip
workspace keys, `tsconfig.eslint.json` + name-specific eslint paths, syncpack, turbo
graph. Biome/stylelint are glob-automatic. `#/` subpath aliases with
`tsc --build && tsc-alias`. No local directory named like a runtime dep.

## 6. Env & flags

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | enables real Jarvis + MCP endpoint |
| `RTC_JARVIS_FAKE=1` | enables Jarvis with `ScriptedAgentLoop` (CI, e2e, offline demos) |
| (neither) | Jarvis effects + MCP not registered; client hides the icon |

## 7. Explicitly out of scope for slice 1

Sentinels/conditional orders (the one genuinely new domain use case), Jarvis driving
the UI, voice, proactive narration, generative panels, deployed mode, standing
subscriptions as tools, server-side compaction, RN client surface for Jarvis.

## 8. Risks & mitigations

- **LLM nondeterminism in live demos** → fake loop as rehearsal/fallback; persona
  prompt keeps behavior narrow; read tools are harmless.
- **Cost surprises** → local-only, token/turn caps, history trimming.
- **MCP SDK adds a server dep** → confined to `packages/server/src/mcp/`; the registry
  stays clean, so ripping out or swapping the MCP SDK touches one directory.
- **WS protocol growth** → `JARVIS_*` types are additive; existing clients ignore
  unknown message types.
- **Two HITL models (in-app card vs MCP-client approval)** → documented in §3.4; the
  registry's `gate` metadata keeps the intent explicit per transport.

## 9. Counterfactual, in one paragraph

To add "an AI that can trade" to a codebase where fetching and business logic live
inside components, you must first *invent* an API that does not exist, keep it in sync
with UI behavior forever, rebuild state handling so an agent can observe and act, and
invent a test seam for a nondeterministic dependency — a rewrite wearing a feature's
clothes. Here, the same feature is: one rxjs-only package (the registry), two adapters
(agent loop, MCP), one machine, one dumb panel, zero domain changes. That asymmetry is
the entire argument of §2, made falsifiable: the implementation plan for slice 1 can be
checked against this paragraph when it ships.

## 10. Capability roadmap — future phases (the grind list)

Ordered by wow-per-believability; every item names the existing seam it exploits.
None of these require changes to `@rtc/domain` except where stated.

### Tier 1 — jaw-droppers

1. **Generative UI bound to live streams.** "Compare GBP crosses volatility over the
   last hour" → Jarvis emits a *declarative panel spec* (chart type, symbols,
   transforms, thresholds); the client materializes a transient HUD panel wired to the
   **live tick streams** — it keeps updating after the LLM has left the conversation.
   Generated UI over real-time push data is the trick almost nobody has seen.
   *Seam:* a spec-interpreter machine + existing stream ports; the LLM only authors JSON.
2. **Jarvis drives the app.** "Set up my morning workspace" → tabs switch, panels
   rearrange, watchlist repopulates, tiles glow as it narrates. *Seam:* all UI state is
   already machines; agent tools = dispatch machine intents (same registry pattern,
   pointed at the presentation layer).
3. **LLM market participants.** Claude-driven RFQ counterparties with personalities
   that price, haggle, and hold grudges — multi-agent theater inside the market, not
   the assistant. *Seam:* dealers/quotes are simulators behind ports; add a
   `ClaudeDealerAdapter`.
4. **Natural-language backtesting.** "Would buying every EUR dip below 1.085 have made
   money today?" → Jarvis writes a small strategy, runs it against recorded session
   ticks server-side, answers with an equity curve in a generated panel (composes with
   #1). *Seam:* price history + simulators; add a sandboxed strategy-runner tool.

### Tier 2 — deep-cut engineering wow

5. **The app introspects itself.** Wire the RTC DevTools observe stream (PR #168 spec:
   BroadcastChannel, machine states, WS traffic) into Jarvis as tools — "why is this
   tile stale?", "did anything leak this session?" answered from the actual reactive
   graph. *Seam:* the devtools bus becomes a tool source; turns that workstream into a
   Jarvis capability for free.
6. **Time travel + explain.** "What happened while I was away?" → replay the event
   log, brief the user, scrub the UI back to the moment PnL dipped. *Seam:* event-shaped
   protocol + SoW replay + devtools time-scrub roadmap.
7. **Sentinels as living HUD entities.** Standing watchers ("watch EUR/USD, buy at
   1.09") with visible presence — orbiting glyphs that pulse while evaluating, flare on
   trigger, execute through the same confirm-gated path. *Seam:* **one new domain use
   case** (the only genuinely new domain concept in the program) + one HUD component.
8. **Cross-device séance.** Start a Jarvis conversation on the web HUD, continue it on
   the RN app — same server-side session, both clients share `client-core`. A quiet but
   devastating proof that the core is framework-free. *Seam:* session keyed to user, not
   socket; RN panel reuses the machine.

### Tier 3 — atmosphere & stagecraft

9. **Proactive narrator, deterministic triggers.** Cheap domain-side statistics detect
   anomalies (spread 3σ, volatility spikes); the LLM is invoked only when a trigger
   fires, to narrate and hypothesize. Alive-feeling proactivity without a token-burning
   poll loop. *Seam:* a small domain-side detector + one server effect.
10. **Voice + wake word.** "Jarvis—" (icon flares) "—flatten my GBP exposure."
    WebSpeech into the same chat pipeline; the confirm card doubles as the safety net
    for mishears. *Seam:* input adapter only; pipeline unchanged.
11. **War-game drills.** "Run a flash-crash drill" → Jarvis orchestrates the simulators
    to inject a scenario, narrates, watches the user's response, debriefs.
    Agent-orchestrates-environment, not agent-answers-questions. *Seam:* simulators
    behind ports accept scenario control.
12. **Ghost trader (computer use).** A Claude computer-use agent trading through the
    rendered UI — screenshots and clicks while you watch the cursor move. Heavy and
    flaky next to MCP, but memorable one-off theater. *Seam:* none needed — that's the
    point of the demo.

Slice 1's tool registry is deliberately the load-bearing primitive for items 1–8.
