# HUD Redesign — Apply the Futuristic Prototype to the Real Client — Design

**Date:** 2026-06-26
**Status:** Approved (pending user review of this spec)
**Design source:** `docs/design/` — the "Reactive Trader — Futuristic Redesign Prototype" (standalone HTML + `dev-handoff/`). A *design artifact* (mock data, `dc-runtime`), not production code. We re-implement its **look, motion, and layout** in the real client; we keep the real app's data and architecture.
**Prototype is still evolving:** the user is actively adding more skins, light/dark mode, and richer feedback animations. This design must absorb those cheaply (skin × mode token architecture, neutral animation director).

## Goal

Transform the production `@rtc/client-react` UI to match the prototype's HUD aesthetic **as closely as possible** — including decorative-but-non-functional chrome where it "looks cool" — and add two genuinely new modules (**Equities**, **Admin observability**), each with its own simulator-backed mock backend. Preserve the clean-architecture grain, the dumb-UI / dependency-rule discipline, and the framework-portability contract (the planned React→SolidJS swap stays alive). This is a **conceptual demo** intended to impress; functional ambition is encouraged, but never at the cost of the architectural constraints below.

## Load-bearing decisions (settled in brainstorming)

1. **Disposition: replace in place.** Transform the real `client-react` UI; regenerate visual goldens and re-baseline contract/visual tests to the new look. One app, new skin.
2. **Portability: preserve discipline + Motion One.** Logic/orchestration stays in framework-neutral presenters/machines; React components stay dumb. Effects are CSS keyframes + Canvas 2D (verbatim-portable) plus **Motion One** (vanilla, WAAPI-based; `solid-motionone` bindings ready) for the few orchestrated animations. No animation is timer-driven — all feedback is driven by real domain stream events. The only framework-coupled animation category (FLIP/drag-physics) is confined behind the `LayoutPort`.
3. **Layout: in-house engine behind a `LayoutPort`, dockview-swappable later.** Reproduce the prototype's behaviors exactly (resizable split panes, maximize-collapses-siblings-to-strips, collapse-to-strip, pinned bottom blotters). The app depends only on the port; a `DockviewLayoutEngine` adapter can drop in later for free-form docking.
4. **Theming: two axes — skin × mode.** A *skin* (`holo` | `terminal` | `neon` | future) defines a visual identity; an orthogonal *mode* (`light` | `dark`) recolors it. Tokens are `tokens[skin][mode]: ThemeTokens`. Adding a skin = one token entry + one switcher option.

## Target architecture

The existing dependency-inversion grain is unchanged. Every new thing slots into it:

```
  domain (neutral, rxjs-only)   entities · ports · SIMULATORS (the mock backend)
                                + equities (marketDataPort, orderPort, positionPort, watchlistPort)
                                + telemetry (telemetryPort, serviceHealthPort, eventLogPort)
                                + layoutPort
        ▲
  app (neutral)                 adapters (sim↔port) · presenters · MACHINES
                                + ThemePreferencePresenter (skin×mode) · LayoutMachine
                                + AnimationDirector · BootSequenceMachine
                                + equities/admin presenters & machines
        ▲
  ui (dumb React)               shell(theme · layout · motion · boot · chrome · status · prefs)
                                · fx · credit · equities · admin
                                CSS-modules + Motion One; no rxjs/localStorage/fetch/setTimeout
```

**Replaceable seams (plugin boundaries):** `ThemePort`/preferences (skin×mode), `LayoutPort` (in-house → dockview), and the UI motion wrapper (Motion One → any engine / Solid bindings). The dependency rule (dependency-cruiser + Biome `noRestrictedImports`) mechanically enforces that app/ui never reach across these seams.

## Decomposition — 7 phases

Each phase is independently shippable, gets its **own implementation plan**, and re-establishes the test contract for what it touched. Phases 0–3 add **zero** domain code (pure presentation reshaping on existing streams); only Phases 4–5 add new domain/simulators.

| # | Phase | Delivers | New domain? |
|---|---|---|---|
| 0 | **Foundation** | skin×mode token system + `ThemeProvider` rework + Motion One integration + `AnimationDirector` seam | no |
| 1 | **Layout engine** | `LayoutPort` + `InhouseLayoutEngine` (splits, maximize, collapse-to-strip, pinned blotters); replaces `shell/layout/Workspace` | no |
| 2 | **HUD shell chrome** | boot sequence (canvas, 3 variants), lock screen, header chrome, status bar, preferences modal | no |
| 3 | **Reskin FX + Credit** | restyle existing modules to new panels/typography/motion; flashes driven by existing RxJS streams | no |
| 4 | **Equities (new)** | entities + ports + simulators + presenters + UI (watchlist, candlestick, tabs, order ticket, blotters, depth ladder, P&L) | **yes** |
| 5 | **Admin (new/expanded)** | telemetry sims + ports + UI (throughput, latency, error rate, sessions, live event log, service topology, simulated incidents) | **yes** |
| 6 | **Goldens & verify** | regenerate both visual-golden sets (x86 + darwin-arm64), re-baseline contracts, e2e, coverage | no |

## Cross-cutting principles (bind every phase)

- **Decorative-but-dead is allowed and explicit.** Cosmetic HUD chrome (fake biometric line, env badges, FPS readout, decorative gauges) ships as pure presentational components with **no port behind them**, clearly named/commented as cosmetic so nobody wires them later by mistake.
- **Calm until something real happens.** Ambient motion (aurora, grid drift) is pure CSS, **off by default** via the existing preferences perf toggle. Feedback animations fire only on real domain events (tick up/down, fill, RFQ expiry, connection change), routed through `AnimationDirector`. No `setTimeout`-driven animation in `src/ui` (grep-gate preserved).
- **Determinism for goldens.** Every simulator takes an injectable seed/clock (precedent: the `RfqCountdownMachine` `Date.now()` freeze). Candle/metric/quote goldens are stable.
- **Dependency rule + dumb-UI gates stay green per task**, not just at the end: `biome ci`, `pnpm typecheck` (incl. server), ESLint (`lint:eslint` + types), stylelint, `pnpm --filter @rtc/tests gates`, dependency-cruiser.
- **Framework-swap structure preserved.** New behavior lives in neutral contract/shared layers; the `react/` swap-trio stays intact so a future SolidJS client inherits the contract. Motion One chosen specifically so orchestration ports via `solid-motionone`.

---

## Phase 0 — Foundation: theming (skin × mode) + motion

### Theming
- Extend `ui/shell/theme/tokens.ts` from one axis to two: `tokens[skin][mode]: ThemeTokens`. Seed skins `holo` / `terminal` / `neon` (dark values from `docs/design/dev-handoff/theme-tokens.css`; light variants derived). The current `dark`/`light` become a `classic` skin so nothing is lost.
- Grow `ThemeTokens` with the prototype's semantic tokens: `--accent-2`, `--panel` (translucent vs solid), `--panel-blur` (0 = solid/terminal, >0 = glass/holo+neon), `--glow`, `--grid`, `--aurora-opacity`, `--chip`, `--font-display`, `--font-mono`. Glass = `backdrop-filter: blur(var(--panel-blur))` — translucency is a token, not a hack.
- `ThemeProvider` resolves `(skin, mode)` → token object → CSS custom properties on `:root`, and sets `<html data-skin data-mode>` for state-class CSS hooks.
- Persistence reuses the existing preferences port/presenter (`ThemePreferencePresenter` extended to carry skin + mode). Switcher = skin picker + light/dark toggle, both dumb UI over the presenter.

### Motion
- Add **Motion One** as the single animation dependency (verify freshness per the repo's dep policy / `minimumReleaseAge` cooldown). Wrap it in `ui/shell/motion/` so the engine is swappable.
- `AnimationDirector` (neutral presenter): subscribes to domain streams, emits animation **intents** (`{ target, kind }`, e.g. `tick:up`, `fill`, `expiry`). The dumb UI maps intents → CSS classes / Motion One calls. No DOM access in the director.

### Tests
- Token resolution + presenter unit tests; contract test for skin×mode persistence; `AnimationDirector` intent-mapping unit tests. Visual goldens deferred to per-phase as components adopt tokens.

---

## Phase 1 — Layout engine (`LayoutPort`)

- `domain/ports/layoutPort.ts`: a layout **tree** of regions (split H/V with draggable handles), panels with `maximize` (siblings collapse to strips), `collapse` (to strip), and a `pinned` slot for bottom blotters; plus focus/registration ops.
- `app/presenters/LayoutMachine.ts`: neutral VM holding the tree, applying ops, emitting view-state. Fully unit-tested (no DOM).
- `ui/shell/layout/engine/InhouseLayoutEngine.tsx`: dumb renderer of the tree + resize-handle behavior. FLIP/drag-physics (the one framework-coupled animation) lives **here**, behind the port — the single spot re-implemented on a Solid swap.
- App/modules import only `LayoutPort`. Swapping to dockview = a `DockviewLayoutEngine` satisfying the same port; no module changes.
- Replaces the current `shell/layout/Workspace.tsx`.
- **Tests:** `LayoutMachine` unit (split/maximize/collapse/pin transitions), UI-contract for handle drag + maximize behavior, visual goldens for the arrangements.

---

## Phase 2 — HUD shell chrome

- **Boot sequence:** port the three canvas draw functions (`globe` / `laser` / `docking`) verbatim into `<BootSequence>`; `BootSequenceMachine` (neutral) owns variant cycling (localStorage via preferences port), progress, `onDone`. Respect `prefers-reduced-motion`. Smooth cross-fade hand-off to the app.
- **Lock screen:** sign-out → session-lock overlay → re-authenticate, hooked to the real connection/session/preferences ports.
- **Header chrome:** account dropdown, language selector, notifications, theme picker (skin+mode), env badge. Real signals wired to real ports; cosmetic readouts marked decorative.
- **Status bar:** latency / FPS / connection / session / clock / build. Connection + session are real; FPS/build are cosmetic.
- **Preferences modal:** the settings catalogue; the **animated-background** toggle is real (the perf gate). Persisted via the preferences port.
- **Tests:** machine units (boot cycling, lock state), UI-contract (skip boot, lock→auth), visual goldens for boot frames (seeded) + chrome.

---

## Phase 3 — Reskin FX + Credit

- Restyle existing `fx` (live rates, tiles, exec overlays, RFQ-on-tile, sortable/filterable/exportable blotter) and `credit` (new-RFQ, streaming dealer quotes, accept/expire, blotter) to the new panels / typography / motion.
- **Behavior unchanged** — only presentation. Price-tick digit flashes and trade/fill/expiry pulses are driven from the existing RxJS price/trade streams via `AnimationDirector`, replacing nothing in the domain.
- All inline-style → CSS-modules discipline applies (grep-gate); semantic `data-*` state classes + `--custom-property` geometry, per the existing migration.
- **Tests:** existing contract specs stay green (behavior unchanged); visual goldens regenerated for the new look.

---

## Phase 4 — Equities module (new)

Follows the existing module grain exactly.

```
domain/equities/     entities: Instrument, Quote, Candle, Order, Position, Fill
domain/ports/        marketDataPort (quotes + candles) · orderPort (place/cancel/ack)
                     · positionPort (live P&L) · watchlistPort
domain/simulators/   EquityMarketDataSimulator (GBM price walk → quotes + OHLC aggregation)
                     · EquityOrderSimulator (accept→working→partial→filled, configurable latency)
                     · PositionSimulator
app/presenters/      WatchlistPresenter · CandleSeriesPresenter · OrderTicketMachine
                     · OrdersBlotterPresenter · PositionsPresenter
ui/equities/         Watchlist · PriceChart (canvas candlestick) · InstrumentTabs
                     · OrderTicket · OrdersBlotter · PositionsBlotter
```

- **Baseline (prototype):** watchlist with live quotes, candlestick chart, instrument tabs, order ticket (buy/sell, qty, limit/market), orders + positions blotters.
- **Going wild (all simulator-backed, so consistent across views):** depth-of-book ladder beside the chart; per-position P&L sparklines + desk-level aggregate gauge; order-fill choreography (ticket→working→partial→filled, each firing an `AnimationDirector` intent); watchlist heat tint + compact sector heatmap.
- **Tests:** simulator unit + golden (seeded walks/candles), port contract specs (mirroring the 14 existing `wsReal*.contract.test.ts`), UI-contract (place order → fill) with `react/` swap-trio, visual goldens (both sets), e2e for the order→fill flow.

---

## Phase 5 — Admin observability (new / expanded)

Expands the existing `adminPort` + `ThroughputSimulator` seam into a full ops dashboard.

```
domain/ports/        telemetryPort (metric streams) · serviceHealthPort · eventLogPort
domain/simulators/   LatencySimulator · ErrorRateSimulator · SessionSimulator
                     · EventLogSimulator · ServiceTopologySimulator  (+ existing Throughput)
app/presenters/      MetricsPresenters · ServiceTopologyPresenter · EventLogPresenter
                     · IncidentMachine
ui/admin/            MetricGauges · ThroughputChart · LatencyHistogram · ErrorRatePanel
                     · SessionsPanel · LiveEventLog · ServiceTopologyGraph · IncidentControls
```

- **Baseline:** throughput, latency, error rate, active sessions, scrolling event log.
- **Going wild:** animated **service topology graph** (nodes pulse with throughput, edges redden under latency); **simulated incidents** — `IncidentMachine` injects a latency spike / error burst on demand, and because incidents flow through the **real connection port**, the FX/Credit connection banners react live (a "watch what happens when I break this" demo moment); SLO-breach feed; session world-map dot field.
- **Tests:** simulator unit + golden, port contract specs, UI-contract (trigger incident → banners react), visual goldens, e2e for the incident flow.

---

## Phase 6 — Goldens & verify (consolidation)

- Regenerate **both** visual-golden sets — CI `react/` (x86) and local `react-local/<arch>/` (darwin-arm64 + linux-arm64 in sandbox) — across all three tiers.
- Re-baseline contract + visual specs to the final look; full e2e (10 parallel suites); coverage report refresh.
- Confirm all gates green: Biome, ESLint (+types), stylelint, dependency-cruiser, manypkg, knip, `@rtc/tests` grep-gates.

## Mock backend — clarification

"Add a mock backend" in this repo means **add a `*Simulator.ts` + a contract test**, not stand up server infra. New simulators register through the existing `portFactory` exactly as the current eleven do; the Marble.js server can expose them over WS via the existing `wsReal*` adapter pattern if/when the real-stack path is wanted. No new transport, no new process.

## Non-goals / out of scope

- No real backend, real market data, real auth, or OpenFin/services layer — everything stays simulator-backed (consistent with the existing app).
- No free-form drag-docking or saved-layout persistence in Phase 1 (the `LayoutPort` leaves the door open for a later dockview adapter; not built now).
- No SolidJS client in this work — only the *portability contract* is preserved so it remains possible.
- No change to the domain dependency rule (`@rtc/domain` stays rxjs-only at runtime).

## Risks & mitigations

- **Golden churn is large (replace-in-place).** Mitigation: per-phase re-baselining so the suite is never red for long; Phase 6 is the deliberate consolidation; seeded simulators keep goldens deterministic.
- **Token surface growth could fragment styling.** Mitigation: all new tokens are semantic and authored for every skin×mode; CSS-modules grep-gate prevents inline-style regressions.
- **Motion One freshness / cooldown.** Mitigation: follow the repo dep policy (`pnpm outdated -r`, `minimumReleaseAge`), confirm latest acceptable version, single range via syncpack.
- **Scope is ambitious for a demo.** Mitigation: the 7-phase decomposition makes each slice independently shippable; "going wild" items are clearly separable from each phase's baseline and can be trimmed without destabilizing the architecture.

## Delivery & git workflow

- All work happens in the isolated worktree `.claude/worktrees/hud-redesign` on branch `worktree-hud-redesign` (branched from `main` @ `521503e`).
- **This spec and the implementation plan are authored on the branch first.** Per the user's instruction, the branch merges to `main` with **`git merge --no-ff`** only **after both the spec and the implementation plan are finished** — not before. (Which plan gates the merge — the Phase-0 plan only, or a full multi-phase plan — is confirmed with the user at the spec-review gate below.)
- Subsequent phases each get their own plan, and each may get its own branch/merge cycle at implementation time, agreed with the user when that phase begins.
- Commit copy ends with the required `Co-Authored-By:` / `Claude-Session:` trailers; `main` is treated as outward-facing (auto-pushes to origin).
