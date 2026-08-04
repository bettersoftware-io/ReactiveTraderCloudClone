# Jarvis Generative UI — Round 1 Design (L1–L2)

**Date:** 2026-08-04
**Status:** Designed, not built
**Parent:** [2026-07-12-jarvis-ai-assistant-design.md](2026-07-12-jarvis-ai-assistant-design.md) — §10 capability roadmap, Tier-1 item 1.

## 0. Vision

"Compare GBP crosses volatility over the last hour" → Jarvis authors a
*declarative panel spec* (JSON, closed vocabulary); the client materializes a
**floating HUD panel wired to the live tick streams**. The panel keeps ticking,
re-ranking, and flashing **after the LLM has left the conversation** — and it
morphs in place when you say "make that a heatmap". Generated UI over real-time
push data is the trick almost nobody has seen: chatbot generative UI renders
*snapshots*; this renders *instruments*.

The model never writes code — only data. The interpreter is a total function
over an enumerated vocabulary: an invalid or unknown spec renders a graceful
"unsupported spec" card, never a crash, never an `eval`.

## 1. Locked decisions (brainstorm 2026-08-04)

| Decision | Choice |
|---|---|
| Ambition | **L1–L2**: live-bound single panels + conversational editing. Docking/persistence (L3), dashboards/linked interactions (L4) deferred. |
| Client scope | **Both web clients** (React + Solid) in lockstep per the parity doctrine. RN deferred (Skia render path is its own round). |
| Panel home | **Floating HUD panel** over the workspace, outside the chat overlay. Survives closing the chat; lives until dismissed. |
| Viz palette | **Standard five**: multi-line chart, ranked table, big-number gauge, sparkline grid, heatmap. |
| Delivery | `render_panel` **tool call** (server-validated) → new `panel` wire event. |
| Tool placement | **WS-chat-surface tool**, NOT an `@rtc/agent-tools` registry citizen — same reasoning as `get_app_context`: meaningless over `/mcp` (an external MCP client has no HUD). The registry stays the transport-neutral MCP-facing contract. |
| Zero-token path | The **scripted brain** emits canned panel specs — full feature works in simulator mode, demos without a key, and CI exercises the real pipeline with no API calls. |

## 2. The spec language — `PanelSpec` v1 (`@rtc/shared`)

Lives in `packages/shared/src/jarvis/panelSpec.ts` (types + validator) because
both the server (tool-input validation) and the client (interpretation) need
it — the same placement logic as the wire protocol. The vocabulary is
**closed**: the model can only combine what we enumerate, never express
arbitrary computation.

```ts
interface PanelSpecV1 {
  readonly v: 1;
  readonly title: string; // ≤48 chars
  readonly rationale?: string; // one-liner provenance, shown on hover
  readonly source: PanelSource;
  readonly transforms: readonly PanelTransform[]; // ≤4, applied in order
  readonly viz: PanelViz;
  readonly annotations?: readonly PanelAnnotation[]; // ≤4
}

type PanelSource =
  | { readonly kind: "fxTicks"; readonly symbols: readonly string[] } // live mids, ≤8 pairs
  | { readonly kind: "priceHistory"; readonly symbols: readonly string[] } // seeded + live
  | { readonly kind: "analytics" } // positions / PnL
  | { readonly kind: "blotter" }; // recent trades

type PanelTransform =
  | { readonly kind: "window"; readonly seconds: number } // rolling time cap
  | { readonly kind: "returns" } // series → pct-change series
  | { readonly kind: "rollingVol"; readonly samples: number } // stdev of returns
  | { readonly kind: "spread"; readonly a: string; readonly b: string } // A − B
  | { readonly kind: "topN"; readonly n: number; readonly by: "value" | "change" };

type PanelViz =
  | { readonly kind: "line" }
  | { readonly kind: "table" }
  | { readonly kind: "gauge"; readonly label?: string }
  | { readonly kind: "sparkGrid" }
  | { readonly kind: "heatmap" };

type PanelAnnotation =
  | { readonly kind: "hline"; readonly value: number; readonly label?: string;
      readonly tone: "info" | "warn" | "danger" }
  | { readonly kind: "zone"; readonly from: number; readonly to: number;
      readonly tone: "info" | "warn" | "danger" };
```

Validation (`parsePanelSpec(input): PanelSpecV1 | { error }`) enforces bounds
(symbol count ≤8, symbols from the known pair roster, transforms ≤4, title
length, finite numbers) and is the **single** gate — the server runs it in the
tool handler, and the client re-runs it at the wire parse seam (defense in
depth; a newer server's vocabulary degrades to "unsupported", never crashes an
older client).

Versioning: `v: 1` discriminant. A future `v: 2` is a new branch at the parse
seam; unknown versions render the unsupported card.

## 3. The tool — `render_panel` (server, WS surface only)

`packages/server/src/agent/` gains a surface-tool definition composed into the
agent loop's tool list *alongside* (not inside) the `@rtc/agent-tools`
registry:

- **Input schema** (raw JSON Schema, same style as the registry):
  `{ spec: PanelSpecV1, targetPanelId?: string }`. `targetPanelId` is how L2
  editing works — the model passes the id of an existing panel to morph it.
- **Handler:** validate via `parsePanelSpec`; on success, mint a `panelId`
  (fresh id when no target; echo the target otherwise), emit the wire event,
  and return `"Rendered panel <panelId>: <title>"` to the model — the id in
  the tool result is what lets the model target edits later in the
  conversation.
- On validation failure the tool returns the validator's message as the tool
  result (the model can self-correct within the same turn); nothing reaches
  the wire.
- Both brains route through the same emission path, so the wire contract has
  exactly one producer shape.
- **Not** confirm-gated: rendering a read-only panel is as safe as answering
  in text. `execute_trade` remains the only confirm-gated tool.

The system prompt for live brains gains the PanelSpec vocabulary and two
few-shot examples (author + edit). This joins the cached prefix — cache
engages on sonnet/opus as today; haiku re-reads it uncached (expected, per the
brain-picker round's cache semantics).

## 4. The wire — one new `JarvisEvent` variant

```ts
| { readonly type: "panel"; readonly panelId: string; readonly spec: PanelSpecV1 }
```

- Carried inside the existing turn-event envelope (has a `turnId` like every
  other event) over the existing `JARVIS_*` messages — no new message types.
- Dismissal is **client-local** (no wire round-trip): the server keeps no
  panel state beyond the ids it has minted. If the user dismisses panel X and
  later says "change that panel", the model's edit targets a dead id — the
  client ignores a `panel` event whose `targetPanelId` no longer exists by
  spawning it as a fresh panel instead (specified behaviour, tested).
- History: panel events are **not** replayed into model history beyond the
  tool call/result pair that produced them (which already lands in history via
  the normal tool loop) — no new history machinery.

## 5. The client — `JarvisPanelsMachine` + dumb renderers

**Machine (`packages/client-core`)** — separate from the chat machine, because
panels outlive turns and the overlay. Chat-machine state dies with the
conversation; `JarvisPanelsMachine`'s lifetime is the session, which makes
"the panel outlives the conversation" true by construction.

- State: an ordered map `panelId → { spec, status: "live" | "unsupported" }`.
- Fold: `panel` events upsert (new id → append; known id → replace spec, which
  the UI animates as a morph); `dismiss(panelId)` intents remove.
- Cap: **4 concurrent panels**; spawning a fifth evicts the oldest (FIFO).
- **Interpreter:** `composePanelStream(spec, ports): Observable<PanelData>` —
  a pure composition of the existing port streams (price ticks, price
  history, analytics, blotter) through the enumerated transform operators
  into a render-ready `PanelData` (series + rows + summary values). Total
  function; per ADR-005 this is an RxJS machine concern in `client-core`,
  not UI code.

**UI (both web clients)** — a `JarvisPanelLayer` floating over the workspace
(top-right cascade stack), each panel a chrome shell (title, provenance
tooltip from `rationale`, dismiss button) around one of five dumb renderers:
`PanelLine`, `PanelTable`, `PanelGauge`, `PanelSparkGrid`, `PanelHeatmap`.
Spec edits morph in place (FLIP via `@rtc/motion-core` where geometry
changes). No rxjs/fetch/localStorage in `src/ui` — presenters feed everything,
per the dumb-UI gates.

**Power-saver:** panels obey the existing motion doctrine — calm reduces
flash/transition effects, **freeze kills all panel motion** (data may still
update textually; nothing animates). Renderers must pass the
`/rtc:perf-audit` census like every other animated surface: compositor-safe
properties only, per `docs/performance.md`.

**Simulator mode:** the sim Jarvis adapter drives the scripted brain, which
emits the same `panel` events — the machine and renderers cannot tell the
difference. The scripted brain (`packages/shared/src/jarvis/`) gains two
canned exchanges: one that authors a panel (e.g. "show me GBP volatility" →
rolling-vol line panel) and one that edits it ("make it a heatmap" → same
`panelId`, heatmap viz).

## 6. Testing (no API calls in CI, per the standing rule)

| Tier | Coverage |
|---|---|
| shared unit | `parsePanelSpec` accept/reject/bounds/clamp table; scripted-brain panel exchanges emit valid specs (validator-round-trip). |
| server unit | `render_panel` handler: valid spec → event emitted + id echoed to model; invalid spec → validator message to model, nothing on wire; edit path echoes `targetPanelId`. |
| client-core unit | `JarvisPanelsMachine` fold marbles (spawn/edit-morph/dismiss/evict-at-5/dead-target-respawn); `composePanelStream` per source × transform × viz (marble tests over injected streams); unsupported-spec totality. |
| UI contract (shared specs, both frameworks) | Panel layer lifecycle: spawn renders chrome + renderer, edit morphs, dismiss removes, unsupported card, provenance tooltip, cap eviction. |
| Visual goldens | The five renderers × representative specs × themes, plus the unsupported card — new scenarios in the shared matrix (react generates, solid asserts, per the dual-set doctrine). |
| e2e (scripted brain) | One ride: ask → panel appears over workspace → close chat → panel still ticking → edit turn → morph → dismiss. |
| Live smoke (manual, keyed) | `jarvis:smoke:live` gains one panel-authoring turn asserting a schema-valid `render_panel` call from the real model. Never CI. |

## 7. Out of scope for this round

- Docking/persistence (L3): pinning into the workspace, prefs-persisted specs.
- Multi-panel dashboards, linked crosshair/time axis, click-through app
  driving (L4).
- React Native rendering (needs a Skia path per renderer).
- Drag-repositioning of floating panels (arrives with L3 docking).
- Proactive/narrator-pushed panels (§10 item 9 composition).
- Any viz type beyond the five; any new domain concept (none needed — the
  interpreter composes existing ports).

## 8. Risks & mitigations

- **Model authors poor specs** (wrong symbols, silly transforms): validator
  bounds + roster whitelist catch malformed ones in-turn (self-correct);
  quality beyond validity is a prompt/few-shot concern, checked by the live
  smoke, not CI.
- **Panel streams leak** (dismissed panel keeps subscribing): the machine owns
  every subscription; dismiss/evict tears down via the fold — pinned by
  marble tests, and the ws-effects resubscribe-leak lesson (#171) says test
  teardown explicitly.
- **Heatmap/gauge animation churn under power-saver**: run `/rtc:perf-audit`
  before merge; freeze must be motion-free by the CSS catch-all + JS gates.
- **Prompt-prefix growth** (+~1k tokens): cached on sonnet/opus; haiku pays it
  per turn — acceptable at haiku pricing, noted in the runbook cost table.
