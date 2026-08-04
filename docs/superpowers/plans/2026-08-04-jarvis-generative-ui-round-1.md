# Jarvis Generative UI Round 1 (L1–L2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis authors declarative `PanelSpec`s via a `render_panel` tool; both web clients materialize floating HUD panels bound to the live tick streams that survive closing the chat and morph in place on conversational edits.

**Architecture:** Spec: [2026-08-04-jarvis-generative-ui-round-1-design.md](../specs/2026-08-04-jarvis-generative-ui-round-1-design.md). Closed-vocabulary `PanelSpec` v1 in `shared`; `render_panel` is a WS-surface tool composed into the agent loop (NOT an `@rtc/agent-tools` citizen); one new `panel` `JarvisEvent`; `JarvisPanelsMachine` + `composePanelStream` interpreter in `client-core`; five dumb renderers per web client; scripted brain emits canned panel exchanges (zero-token demo + CI path).

**Tech Stack:** existing — rxjs machines, ws-effects, `@rtc/ui-contract` swap-trio, no new dependencies.

## Global Constraints

- **The vocabulary is closed and validated at BOTH ends.** `parsePanelSpec` is the single validator (in `shared`); the server runs it in the tool handler, the client re-runs it at the adapter parse seam. An invalid/unknown spec client-side becomes `status: "unsupported"` — rendered as a card, never a crash, never a dropped event. No `eval`, no codegen, no dynamic keys.
- **Bounds enforced by the validator:** `v === 1`; title 1–48 chars; symbols 1–8, each present in the known pair roster (injected, not imported — the validator takes `knownSymbols: readonly string[]`); transforms ≤4; annotations ≤4; all numbers finite; `window.seconds` 10–3600; `rollingVol.samples` 2–500; `topN.n` 1–8.
- **`render_panel` is NOT confirm-gated** and is NOT added to `@rtc/agent-tools` (the registry stays the transport-neutral `/mcp` contract; dep-cruiser `agent-tools-stays-inner` untouched). It lives in `packages/server/src/agent/`.
- **Panel cap: 4 concurrent panels, FIFO eviction** of the oldest on the fifth spawn. An edit targeting an unknown/dismissed `panelId` spawns a fresh panel (never errors).
- **Wire changes are additive.** A pre-round client ignores unknown `panel` turn events (verify: the adapter's payload switch must default to ignore, and this round must not change any existing event's shape). Panel events carry `turnId` like every turn event; dismissal is client-local (no wire).
- **No Anthropic API call in any CI-run test.** Live-model spec-authoring quality is checked only by the manual keyed `jarvis:smoke:live`.
- **No new domain concepts.** `packages/domain/` does not change in this round. `packages/shared/` and inward only.
- Repo gates as always: biome ci, both ESLint configs, knip, dep-cruiser, grep gates (no rxjs/localStorage/fetch in `src/ui`), `.js` ESM specifiers in nodenext packages (`shared`, `client-core`, `server`), handler naming (`rtc/name-functions-by-effect`), React Compiler (no manual memo), both web clients' ui:contract coverage ≥95% (branches ≥85% solid).
- **Power-saver doctrine:** panels animate only `transform`/`opacity` (see `docs/performance.md`); freeze must be motion-free — run `pnpm perf:motion-audit` (react) + `:solid` before final review if any animation is added.
- **Ship sequence (lesson from the brain-picker round):** dispatch `update-visual-goldens --ref <branch>` and let it auto-commit the x86 set BEFORE merging; a conflicting PR gets no CI run at all — merge `origin/main` in first if conflicted.
- **New e2e feature files must be added to `FEATURE_NAMES`** in `tests/scripts/grep-gates.ts` (gate 21's list is hardcoded) — prefer extending the existing jarvis feature instead.

## File Structure (per task below)

New: `packages/shared/src/jarvis/panelSpec.ts` (+ tests); `packages/server/src/agent/renderPanelTool.ts` (+ tests); `packages/client-core/src/presenters/JarvisPanelsMachine.ts`, `packages/client-core/src/presenters/composePanelStream.ts` (+ tests); `packages/client-{react,solid}/src/ui/shell/jarvis/panels/` (JarvisPanelLayer + 5 renderers + CSS modules); ui-contract `JarvisPanelLayerPage` + `JarvisPanelLayer.contract.spec.ts`.
Modified: `jarvisEvent.ts`, `jarvisIntent.ts`, `ScriptedJarvisEngine.ts`, `jarvisPersona.ts`, `AnthropicAgentSession.ts` (tool list), `WsJarvisAdapter.ts`, `ScriptedJarvisAdapter.ts`, both `App.tsx` mounts, both bindings, ui-contract world/components/fixtures/scenarios, e2e jarvis feature, `scripts/jarvis-smoke-live` (name per repo), docs + STATUS.

---

### Task 1: Shared — `PanelSpec` v1 + validator

**Files:**
- Create: `packages/shared/src/jarvis/panelSpec.ts`
- Create: `packages/shared/src/jarvis/__tests__/panelSpec.test.ts`
- Modify: `packages/shared/src/index.ts` (exports)

**Interfaces (Produces — later tasks rely on these exact names):**

```ts
export interface PanelSpecV1 {
  readonly v: 1;
  readonly title: string; // 1–48 chars
  readonly rationale?: string; // ≤200 chars, provenance tooltip
  readonly source: PanelSource;
  readonly transforms: readonly PanelTransform[]; // ≤4, applied in order
  readonly viz: PanelViz;
  readonly annotations?: readonly PanelAnnotation[]; // ≤4
}
export type PanelSource =
  | { readonly kind: "fxTicks"; readonly symbols: readonly string[] }
  | { readonly kind: "priceHistory"; readonly symbols: readonly string[] }
  | { readonly kind: "analytics" }
  | { readonly kind: "blotter" };
export type PanelTransform =
  | { readonly kind: "window"; readonly seconds: number }
  | { readonly kind: "returns" }
  | { readonly kind: "rollingVol"; readonly samples: number }
  | { readonly kind: "spread"; readonly a: string; readonly b: string }
  | { readonly kind: "topN"; readonly n: number; readonly by: "value" | "change" };
export type PanelViz =
  | { readonly kind: "line" }
  | { readonly kind: "table" }
  | { readonly kind: "gauge"; readonly label?: string }
  | { readonly kind: "sparkGrid" }
  | { readonly kind: "heatmap" };
export type PanelAnnotationTone = "info" | "warn" | "danger";
export type PanelAnnotation =
  | { readonly kind: "hline"; readonly value: number; readonly label?: string; readonly tone: PanelAnnotationTone }
  | { readonly kind: "zone"; readonly from: number; readonly to: number; readonly tone: PanelAnnotationTone };

export type ParsePanelSpecResult =
  | { readonly ok: true; readonly spec: PanelSpecV1 }
  | { readonly ok: false; readonly error: string };
export function parsePanelSpec(
  input: unknown,
  knownSymbols: readonly string[],
): ParsePanelSpecResult;

/** Raw JSON Schema for the render_panel tool input — same style as @rtc/agent-tools. */
export const PANEL_SPEC_JSON_SCHEMA: Record<string, unknown>;
```

- [ ] **Step 1:** Write the failing test table: valid minimal spec (fxTicks+line) → `ok:true`; every bound from Global Constraints rejected with a message naming the field (`"title"`, `"symbols"`, `"transforms"`, …); unknown `source.kind`/`viz.kind`/`transform.kind` rejected; unknown symbol rejected against `knownSymbols`; extra unknown top-level keys tolerated-and-stripped is NOT required — reject nothing for extra keys, just ignore them (structural read, not exhaustive). `pnpm --filter @rtc/shared test` → FAIL.
- [ ] **Step 2:** Implement `parsePanelSpec` as a hand-rolled structural walk (no schema library — mirror how `@rtc/agent-tools` handlers validate inputs by hand). Error strings are `"<field>: <problem>"`, returned to the model verbatim by Task 3.
- [ ] **Step 3:** Write `PANEL_SPEC_JSON_SCHEMA` describing the same shape (enums for every `kind`, min/max for every bound) — the model-facing contract. Test: schema's enum lists match the validator's accepted kinds (derive both from shared `const` arrays so they cannot drift).
- [ ] **Step 4:** `pnpm --filter @rtc/shared test && pnpm --filter @rtc/shared build` → PASS. Commit: `feat(shared): PanelSpec v1 vocabulary + parsePanelSpec validator`

---

### Task 2: Shared — `panel` wire event + scripted-brain panel exchanges

**Files:**
- Modify: `packages/shared/src/jarvis/jarvisEvent.ts`
- Modify: `packages/shared/src/jarvis/jarvisIntent.ts` (+ its test)
- Modify: `packages/shared/src/jarvis/ScriptedJarvisEngine.ts` (+ its test)

**Interfaces (Produces):**

```ts
// jarvisEvent.ts — ADDITIVE:
| { readonly type: "panel"; readonly panelId: string; readonly spec: PanelSpecV1 }

// jarvisIntent.ts — two new intents, matched BEFORE the fallback:
| { readonly kind: "showPanel" }   // e.g. /volatility|vol panel|show .* (chart|panel)/i on majors
| { readonly kind: "restylePanel"; readonly viz: "heatmap" | "table" | "line" } // "make (it|that) a heatmap|table|line"
```

- [ ] **Step 1:** Failing engine tests: `"show me gbp volatility"` → event sequence contains exactly one `panel` event with `panelId: "panel-scripted-1"`, a spec that round-trips `parsePanelSpec` (`ok:true` against the engine's own pair roster), `source.kind === "priceHistory"` (GBP pairs), a `rollingVol` transform, `viz.kind === "line"`, followed by speech deltas + `done`. Then `"make it a heatmap"` → one `panel` event with the SAME `panelId` and `viz.kind === "heatmap"`; `restylePanel` with no prior panel this session → plain fallback-style reply, NO panel event.
- [ ] **Step 2:** Add the intents to `matchJarvisIntent` (test alongside existing intent tests) and the engine handlers: the engine keeps a `lastPanel: { id: string; spec: PanelSpecV1 } | null` field per instance; `showPanel` emits the canned GBP-vol spec + a one-line reply via the existing `speechChunks` path; `restylePanel` re-emits `lastPanel` with the new viz. Specs are module-level consts, each with a `rationale`.
- [ ] **Step 3:** `pnpm --filter @rtc/shared test` → PASS. Commit: `feat(shared): panel JarvisEvent + scripted-brain panel exchanges`

---

### Task 3: Server — `render_panel` surface tool + session integration

**Files:**
- Create: `packages/server/src/agent/renderPanelTool.ts`
- Create: `packages/server/src/agent/renderPanelTool.test.ts`
- Modify: `packages/server/src/agent/AnthropicAgentSession.ts` (tool list + event emission)
- Modify: `packages/server/src/agent/jarvisPersona.ts` (+ its test)

**Interfaces (Produces):**

```ts
export const RENDER_PANEL_TOOL_NAME = "render_panel";
export interface RenderPanelDeps {
  readonly knownSymbols: readonly string[];
  readonly emitPanel: (panelId: string, spec: PanelSpecV1) => void;
  readonly mintPanelId: () => string; // injected for testability; prod = crypto.randomUUID-based "panel-<uuid>"
}
/** Tool definition + handler in the same shape AnthropicAgentSession consumes for registry tools. */
export function buildRenderPanelTool(deps: RenderPanelDeps): /* the session's existing tool type */;
```

Input schema: `{ spec: <PANEL_SPEC_JSON_SCHEMA>, targetPanelId?: string }`.

- [ ] **Step 1:** Read `AnthropicAgentSession.ts` first to identify (a) the exact internal tool type the registry tools are adapted into, and (b) how `toolEvent`s are pushed onto the turn's event stream — `emitPanel` must push a `panel` event onto the SAME stream so ordering with deltas/toolEvents is preserved. Do not invent a second channel.
- [ ] **Step 2:** Failing tests: valid spec → `emitPanel` called with a fresh minted id, handler resolves to `"Rendered panel <id>: <title>"`; valid spec + `targetPanelId: "p1"` → `emitPanel("p1", …)` and `"Rendered panel p1: <title>"`; invalid spec → handler resolves to the validator's error string, `emitPanel` NOT called; unknown symbol → same. NOT confirm-gated: assert the handler runs without any ConfirmGate involvement.
- [ ] **Step 3:** Implement; compose into the session's tool list for live brains only (the scripted loop emits panels from the engine — assert `ScriptedAgentLoop` needs no change). Extend `jarvisPersona.ts` with the panel vocabulary section + two few-shot examples (author; edit-by-`targetPanelId`); persona test asserts the section mentions every viz kind (derive from the shared const array).
- [ ] **Step 4:** `pnpm --filter @rtc/server test && pnpm --filter @rtc/server build` → PASS. Commit: `feat(server): render_panel surface tool wired into the Anthropic session`

---

### Task 4: client-core — adapters parse/pass through `panel` events

**Files:**
- Modify: `packages/client-core/src/adapters/WsJarvisAdapter.ts` (+ tests)
- Modify: `packages/client-core/src/adapters/ScriptedJarvisAdapter.ts` (+ tests, only if it filters event types — if it forwards `JarvisEvent` verbatim, add the pass-through test and no code)

**Interfaces (Consumes):** Task 1's `parsePanelSpec`; the adapter's existing payload-switch style (`WsJarvisAdapter.ts:127-146`).

- [ ] **Step 1:** Failing tests: a wire `panel` payload with a VALID spec → adapter emits `{ type:"panel", panelId, spec }`; an INVALID spec (client-side re-validation fails) → adapter emits `{ type:"panel", panelId, spec: <raw> }`? — NO: define the parse-seam behaviour precisely: the adapter emits a `panel` event ONLY when `parsePanelSpec` passes; on failure it emits `{ type:"panel", panelId, spec: UNSUPPORTED_PANEL_SPEC }` where `UNSUPPORTED_PANEL_SPEC` is a sentinel exported from `JarvisPanelsMachine.ts` (Task 5) — the machine maps it to `status:"unsupported"`. Unknown payload `type`s continue to be ignored (regression test).
- [ ] **Step 2:** Implement; the client-side `knownSymbols` for re-validation comes from the adapter's existing reference-data access — read the adapter's deps; if it has none, validate with `knownSymbols: []` semantics changed to "skip roster check when list empty" (add that mode to `parsePanelSpec` in the same commit, tested in shared).
- [ ] **Step 3:** `pnpm --filter @rtc/client-core test` → PASS. Commit: `feat(client-core): panel turn events through both jarvis adapters`

---

### Task 5: client-core — `JarvisPanelsMachine`

**Files:**
- Create: `packages/client-core/src/presenters/JarvisPanelsMachine.ts`
- Create: `packages/client-core/src/presenters/__tests__/JarvisPanelsMachine.test.ts` (or the dir's existing test-location convention — match `JarvisMachine`'s)

**Interfaces (Produces):**

```ts
export const MAX_LIVE_PANELS = 4;
/** Frozen well-known spec the adapter substitutes on a failed client-side parse;
 *  the machine detects it BY REFERENCE and marks the panel "unsupported". */
export const UNSUPPORTED_SENTINEL_SPEC: PanelSpecV1;
export type PanelStatus = "live" | "unsupported";
export interface PanelInstance {
  readonly panelId: string;
  readonly spec: PanelSpecV1 | null; // null = unsupported
  readonly status: PanelStatus;
}
export interface JarvisPanelsState { readonly panels: readonly PanelInstance[]; }
export function createJarvisPanelsMachine(events$: Observable<JarvisEvent>): {
  readonly state$: Observable<JarvisPanelsState>;
  readonly dismissPanel: (panelId: string) => void;
};
```

Sentinel mechanics: the wire type stays `spec: PanelSpecV1` (no `null` on the wire). On a failed client-side parse the ADAPTER substitutes the exported `UNSUPPORTED_SENTINEL_SPEC` — the frozen spec `{v:1, title:"Unsupported panel", source:{kind:"blotter"}, transforms:[], viz:{kind:"table"}}` — and the machine detects it by reference equality to set `status:"unsupported"` (and `spec: null` in `PanelInstance`). Reference equality is the discriminator; document it at both sites. Tasks 4 and 5 coordinate through this exact exported const (Task 5 creates it; Task 4's brief names it as an interface it consumes — if Task 4 runs first, it may stub the const in `JarvisPanelsMachine.ts` with only that export).

- [ ] **Step 1:** Failing marble/fold tests: spawn appends; same `panelId` replaces in place (order preserved — morph, not move); 5th spawn evicts index 0; `dismissPanel` removes; a later edit targeting the dismissed id appends as fresh; sentinel spec → `status:"unsupported"`; state replays current on late subscribe (match `JarvisMachine`'s replay idiom).
- [ ] **Step 2:** Implement (scan-based fold over a merged `events$`/intents subject, same pattern as existing machines). Session lifetime: created once at composition, NOT per overlay mount.
- [ ] **Step 3:** `pnpm --filter @rtc/client-core test` → PASS. Commit: `feat(client-core): JarvisPanelsMachine — spawn/morph/dismiss/evict fold`

---

### Task 6: client-core — `composePanelStream` interpreter + presenter + bindings

**Files:**
- Create: `packages/client-core/src/presenters/composePanelStream.ts` (+ tests)
- Create: `packages/client-core/src/presenters/JarvisPanelsPresenter.ts` (+ tests)
- Modify: `packages/client-core/src/composition.ts` (register machine + presenter; mirror how `JarvisMachine`/`JarvisUsagePresenter` are composed)
- Modify: both bindings (`react-bindings`, `solid-bindings`): `useJarvisPanels` (mirror `useJarvisUsage` exactly)

**Interfaces (Produces):**

```ts
export type PanelPoint = { readonly t: number; readonly v: number };
export type PanelTone = "up" | "down" | "flat" | "info" | "warn" | "danger";
export type PanelData =
  | { readonly kind: "line"; readonly series: readonly { label: string; points: readonly PanelPoint[] }[]; readonly annotations: readonly PanelAnnotation[] }
  | { readonly kind: "table"; readonly columns: readonly string[]; readonly rows: readonly { readonly cells: readonly string[]; readonly tone: PanelTone }[] }
  | { readonly kind: "gauge"; readonly label: string; readonly value: string; readonly delta: string; readonly tone: PanelTone }
  | { readonly kind: "sparkGrid"; readonly cells: readonly { label: string; points: readonly number[]; change: string; tone: PanelTone }[] }
  | { readonly kind: "heatmap"; readonly rows: readonly { label: string; cells: readonly { label: string; intensity: number; text: string }[] }[] }; // intensity −1..1
export interface PanelStreamDeps { /* the subset of existing ports: pricing, referenceData, analytics, blotter — copy ScriptedJarvisDeps' port types */ }
export function composePanelStream(spec: PanelSpecV1, deps: PanelStreamDeps): Observable<PanelData>;

// JarvisPanelsPresenter view model:
export interface JarvisPanelVm {
  readonly panelId: string; readonly title: string; readonly rationale: string | null;
  readonly status: PanelStatus; readonly vizKind: PanelViz["kind"] | null;
  readonly data$: Observable<PanelData>; // NEVER for unsupported (EMPTY)
}
panels$: Observable<readonly JarvisPanelVm[]>; dismissPanel(panelId): void;
```

- [ ] **Step 1:** Failing interpreter tests (marbles over injected fake ports): fxTicks+line accumulates points per symbol capped by `window`; `returns`/`rollingVol` numeric cases with hand-computed expectations (3–5 ticks each); `spread` subtracts; `topN` on table sorts+limits; analytics→table maps positions; blotter→table maps recent trades; every viz kind reachable from at least one source; a spec whose transform chain is nonsensical for its source (e.g. `rollingVol` on `blotter`) yields a valid-but-empty `PanelData` (totality — no throw). Cap in-memory points at 600/series.
- [ ] **Step 2:** Implement as pure rxjs composition (scan windows, no timers of its own beyond the source streams). One subscription per panel, shared/replay(1) so multiple UI subscribers don't double-subscribe ports.
- [ ] **Step 3:** Presenter: join machine state with per-panel streams; teardown test — dismissing a panel unsubscribes its port streams (the ws-effects #171 lesson: assert via a spy on the fake port's unsubscribe).
- [ ] **Step 4:** Bindings hooks in both packages; `pnpm --filter @rtc/client-core --filter @rtc/react-bindings --filter @rtc/solid-bindings test` → PASS. Commit: `feat(client-core): composePanelStream interpreter + JarvisPanelsPresenter + bindings`

---

### Task 7: React UI — `JarvisPanelLayer` + five renderers

**Files:**
- Create: `packages/client-react/src/ui/shell/jarvis/panels/JarvisPanelLayer.tsx` (+ `.module.css`)
- Create: `.../panels/PanelLine.tsx`, `PanelTable.tsx`, `PanelGauge.tsx`, `PanelSparkGrid.tsx`, `PanelHeatmap.tsx` (+ one shared `panels.module.css` or per-component, follow the dir's convention)
- Modify: `packages/client-react/src/ui/App.tsx` (mount the layer as `JarvisOverlay`'s sibling)

**Requirements:**
- Layer: fixed top-right cascade stack (each panel offset down-left ~16px), `data-testid="jarvis-panel-layer"`; panel chrome: title, rationale tooltip (`title` attribute is fine), dismiss button `data-testid="jarvis-panel-dismiss"`, panel root `data-testid="jarvis-panel"` + `data-panel-id`, `data-status`.
- Renderers are dumb: props = `PanelData` variant only; SVG for line/sparklines (follow the existing sparkline component's approach — find it in the FX tile); heatmap cells colored by intensity via CSS custom property set per-cell inline style is BANNED (inline-style lint) — use a small fixed bucket scale (e.g. 7 intensity classes).
- Line renderer draws `hline`/`zone` annotations with tone classes.
- Unsupported → a card with the title "UNSUPPORTED PANEL" and a one-line explanation, no renderer.
- Animation budget: number/cell updates may flash via `opacity` transitions only; panel spawn/dismiss = one `transform+opacity` transition; morph (viz swap) = crossfade, FLIP via `@rtc/motion-core` only if geometry actually changes — all gated so freeze renders static (reuse the existing power-saver gate hooks the tiles use).
- [ ] **Step 1:** Build layer + renderers (no component-level tests here — the shared contract specs in Task 9 are the behavioural coverage; keep any react-only logic trivial).
- [ ] **Step 2:** Manual check: `pnpm dev` → login → jarvis → "show me gbp volatility" → panel appears, ticks; close chat → still ticking; "make it a heatmap" → morphs; dismiss works. `pnpm --filter @rtc/client-react build` passes.
- [ ] **Step 3:** Commit: `feat(client-react): JarvisPanelLayer + five panel renderers`

---

### Task 8: Solid UI parity

**Files:** mirror Task 7 under `packages/client-solid/src/ui/shell/jarvis/panels/` + `App.tsx` mount.

- [ ] **Step 1:** Port verbatim (CSS modules copy; JSX → Solid idioms; `useJarvisPanels` from `solid-bindings`). Same testids, same class names.
- [ ] **Step 2:** Manual check via `pnpm dev:solid` (same script as Task 7 Step 2). `pnpm --filter @rtc/client-solid build` passes.
- [ ] **Step 3:** Commit: `feat(client-solid): JarvisPanelLayer parity port`

---

### Task 9: ui-contract — world seeds, page object, shared contract specs

**Files:**
- Modify: `packages/ui-contract/src/shared/harness/world.ts` (drive `panel` events through the existing jarvis event seeding path)
- Create: `packages/ui-contract/src/shared/pages/shell/jarvis/JarvisPanelLayerPage.ts`
- Create: `packages/ui-contract/src/specs/shell/jarvis/JarvisPanelLayer.contract.spec.ts`
- Modify: `packages/ui-contract/src/shared/components.ts` (register the layer in the swap-trio component map)

**Spec cases (both frameworks must pass):** spawn renders chrome+renderer with title; line/table/gauge/sparkGrid/heatmap each render their discriminating testid/structure from a seeded `PanelData`-producing spec; edit event with same id morphs (old renderer gone, new present, same `data-panel-id`); dismiss removes; 5th spawn evicts the first; unsupported card for the sentinel; rationale tooltip present; layer absent when no panels.

- [ ] **Step 1:** Write specs against the page object → run react side `pnpm --filter @rtc/client-react test:ui:contract` → FAIL (missing world plumbing) → implement world/page → PASS.
- [ ] **Step 2:** `pnpm --filter @rtc/client-solid test:ui:contract` → PASS (fix solid-side drift, not the spec).
- [ ] **Step 3:** Both coverage gates: `test:ui:contract:coverage` react ≥95% and solid ≥95%/branches ≥85% → PASS. Commit: `test(ui-contract): JarvisPanelLayer shared contract specs`

---

### Task 10: Visual scenarios + local goldens

**Files:** per the 5-edit recipe in [reference_visual_scenario_add_recipe]: `packages/ui-contract/src/visual/scenarios.ts`, `fixtures.ts`, `appData.ts`, `scenarioActions.ts`, + both clients' visual runner lists if the recipe's audit says so.

**Scenarios:** `jarvis/panel-line`, `jarvis/panel-table`, `jarvis/panel-gauge`, `jarvis/panel-spark-grid`, `jarvis/panel-heatmap`, `jarvis/panel-unsupported` — deterministic seeded `PanelData` (frozen fixture ticks, no live simulator time; first-mount race trap: wait for the panel testid before capture).

- [ ] **Step 1:** Add scenarios; regenerate the local `react-local/darwin-arm64` set; eyeball each PNG.
- [ ] **Step 2:** Solid visual tier asserts against the same goldens → run it → fix drift until green within tolerance.
- [ ] **Step 3:** Commit: `test(visual): jarvis panel scenarios + darwin-arm64 goldens`

---

### Task 11: e2e (scripted ride) + live smoke extension

**Files:**
- Modify: the existing jarvis e2e feature + step defs under `tests/` (find via `grep -rl jarvis tests/specs tests/steps`) — extend, do NOT create a new feature file (gate-21 `FEATURE_NAMES` stays untouched).
- Modify: the `jarvis:smoke:live` script (one new panel-authoring turn).

- [ ] **Step 1:** e2e scenario: open jarvis → "show me gbp volatility" → panel visible over workspace → close overlay → panel still present → "make it a heatmap" → same panel heatmap → dismiss → gone. Respect the e2e flake lessons: state-qualified testids (`data-status`), no fixed sleeps shorter than scripted delays, poll on testid appearance.
- [ ] **Step 2:** Run the jarvis e2e suite locally (its `run-all.ts` port slot) → PASS.
- [ ] **Step 3:** Live smoke: add one turn asking for a volatility panel; assert a `render_panel` tool call arrives whose input round-trips `parsePanelSpec`. Do NOT run in CI; run once manually with the key before ship and record the result in the PR body.
- [ ] **Step 4:** Commit: `test(e2e): scripted generative-panel ride + live smoke panel turn`

---

### Task 12: Docs + STATUS

**Files:**
- Modify: `docs/architecture/18-jarvis-ai-agent-surface.md` (new §18.16 — the generative-UI surface: PanelSpec/closed-vocabulary rationale, WS-surface tool placement vs the registry, both-ends validation, machine lifetime)
- Modify: `docs/running-real-jarvis.md` (prompt-prefix cost note: +~1k tokens, cached sonnet/opus, per-turn on haiku)
- Modify: `docs/STATUS.md` (flip the round-1 entry: 🔴 → delete on ship, add follow-ups L3/L4/RN/drag as a ⚪ bullet under the Jarvis governance/roadmap area)

- [ ] **Step 1:** Write §18.16 + runbook note; `pnpm check:doc-links` → PASS.
- [ ] **Step 2:** Commit: `docs(jarvis): §18.16 generative-UI receipt + cost note + STATUS`

---

## Self-Review Notes

- **Task 4/5 sentinel coupling** is the one deliberately shared exact value (`UNSUPPORTED_SENTINEL_SPEC`, exported from `JarvisPanelsMachine.ts`, consumed by `WsJarvisAdapter.ts`); both task briefs carry it verbatim.
- **Spec coverage check:** spec §2 → Task 1; §3 → Task 3; §4 → Tasks 2 (event) + 4 (parse); §5 → Tasks 5–8; §6 table rows map 1:1 to Tasks 1,2,3,5,6,9,10,11; §7 exclusions restated in Global Constraints (no L3/L4/RN/drag).
- **Type-consistency check:** `PanelSpecV1`/`parsePanelSpec`/`PANEL_SPEC_JSON_SCHEMA` (T1) consumed by T2/T3/T4; `PanelData`/`PanelStreamDeps` (T6) consumed by T7/T8/T9 fixtures; `MAX_LIVE_PANELS` (T5) asserted in T9's eviction spec.
- **Order:** T1→T2→T3 serial (shared→server); T4→T5→T6 serial after T2; T7/T8 after T6; T9 after T7+T8; T10 after T9; T11 after T8; T12 last. T3 is parallel-safe with T4–T6.
