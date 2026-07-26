# Jarvis Phase 1 — scripted core surface (design spec)

**Date:** 2026-07-26
**Status:** Approved design, pre-implementation-plan
**Parent spec:** [2026-07-12-jarvis-ai-assistant-design.md](2026-07-12-jarvis-ai-assistant-design.md)
— still authoritative for the real agent loop, `@rtc/agent-tools`, the `JARVIS_*` wire
protocol, and the MCP endpoint (phases 2–4 below). This spec re-phases delivery and
defines phase 1 only.

## 0. What changed since the parent spec

The v5 web design prototype (`docs/design/web/v5/`) now contains a complete **fake
J.A.R.V.I.S demo**: a pulsating header orb (two skins), a ⌘/Ctrl+J full-screen
cinematic overlay, scripted desk intelligence composed from live prototype state,
command execution that drives the real tile flow, sentinel agents, widgets, voice and
an autoplay demo. Its dev handoff (`docs/design/web/v5/dev-handoff/HANDOFF.md` §5)
explicitly prescribes the porting seam: *each regex branch of the scripted brain ≙ one
tool; keep the same tool surface and swap the brain for a real LLM later.*

That demo changes the cheapest path to a working Jarvis: instead of starting with the
server agent loop (parent spec slice 1), **phase 1 ports the scripted core surface to
`client-react` + `client-solid` on the real seams** — `JarvisMachine`,
`JarvisPort`, dumb UI — with the scripted brain as a client-side adapter. Every later
phase is then an adapter/package swap, which is itself the §2 thesis receipt.

## 1. Decisions (locked with user, 2026-07-26)

1. **Phase-1 scope: core surface.** Orb (both skins) + cinematic overlay + scripted
   chat with typed-out reveal + suggestion chips + confirm-gated `buy 5M EURUSD` →
   real execution. Desk control, sentinels, morning briefing, widgets rail,
   backtester, drills, autoplay, guide panel, voice and the RN surface are all
   deferred to later phases.
2. **The scripted brain is a client-side adapter** (`ScriptedJarvisAdapter` behind
   `JarvisPort` in `client-core`), composed at each client's composition root — the
   same pattern as every other simulator port. Zero server changes in phase 1;
   Jarvis works in plain `pnpm dev`.
3. **Phase ladder: wire → brain → MCP** (§4). Each phase leaves a working demo.
4. **Form factor: the v5 cinematic overlay** (full-screen, desk dimmed), not the
   parent spec's docked side panel. Perf constraints in §3.
5. **Audio:** Jarvis voice is out of scope indefinitely (feasibility unclear). The
   prototype's synthesized SFX engine is a **separate workstream** (tracked in
   `docs/STATUS.md`, not this spec); when it lands, Jarvis open/close swells hook
   into it. Boot splash music is explicitly not planned (logged in STATUS.md only).

## 2. Phase-1 scope

### In

- **Header orb** (both web clients, shell chrome right cluster): two skins —
  MK-I Singularity / MK-II Reactor — as a persisted preference; unread badge;
  states `idle | speaking | attention` via `data-jarvis-state`.
- **Cinematic overlay**: opened by orb click or ⌘/Ctrl+J, closed by ✕/Escape.
  Full-screen; desk dimmed by a static semi-opaque layer. Holographic core +
  voice-waveform visual (active only while the overlay is open), message list with
  typed-out reveal, suggestion chips, input row, footer skin switch.
- **Scripted desk intelligence** (answers composed from live client-side state, so
  identical behavior in `:sim` and `:ws` modes): spot quotes ("where is EURUSD?"),
  movers, spreads, session P&L, blotter counts, plus a fallback reply for
  unrecognized input that states current capabilities.
- **Confirm-gated execution**: "buy 5M EURUSD" / "sell 2M GBPUSD" → confirm card
  (pair, BUY/SELL badge in FX-tile colors, notional, quoted price, Confirm/Reject,
  60s countdown ring) → on confirm, the real `ExecuteTradeUseCase` runs and the
  result (fill or rejection) is reported back in chat; the trade appears in the
  live blotter. Decline or timeout → scripted acknowledgement. The prototype
  executes ungated; the gate is added now because the parent spec locks it for the
  real loop and the card UI is needed regardless.

### Out (deferred, with their phase)

Desk control (theme/tabs/filter by asking), sentinel agents, morning briefing,
widgets rail, backtester, drills, autoplay demo, guide panel — phase 5+ scripted
breadth (parent spec §10). Voice — out indefinitely. SFX — separate workstream.
RN Jarvis surface — parent spec §10 tier 2 (cross-device). Server/wire/LLM/MCP —
phases 2–4.

## 3. Architecture

```
client-core/
  presenters/JarvisMachine        state {open, skin, entries[], phase: idle|speaking,
                                  pendingConfirmation} ; intents open/close/send/
                                  confirm/reject/setSkin + adapter replies
  adapters/JarvisPort             port interface (application concern — deliberately
                                  NOT domain/ports; @rtc/domain stays byte-identical)
  adapters/ScriptedJarvisAdapter  the ported regex-cascade brain
```

- **`ScriptedJarvisAdapter`** implements `JarvisPort` against injected domain use
  cases/ports (prices, blotter, analytics, execution). Internally shaped as
  *intent → tool call → use case* mirroring handoff §5's tool mapping (`quote`,
  `trade`, `movers`, `pnl`, …), so phase 3 replaces the cascade with the
  `@rtc/agent-tools` registry without touching the machine or UI. Replies are
  emitted through the port as **delta chunks** (text fragments, then a done
  signal) — the exact shape `JARVIS_DELTA`/`JARVIS_DONE` will deliver in phase 2,
  so the adapter swap is invisible to the machine. The typewriter reveal is a
  separate, purely visual layer over the accumulated text (§ below).
- **`JarvisMachine`** (client-core presenters, per ADR-005: autonomous async fold).
  Owns the confirm lifecycle including the 60s timeout. The pending confirmation is
  resolved through the port so the phase-2 wire (`JARVIS_CONFIRM_REQUEST` /
  `JARVIS_CONFIRM`) maps 1:1.
- **Typed-out reveal**: the reveal cadence is the *adapter's* chunked delta
  emission — pure chunk math in `@rtc/motion-core` (`speechChunks`), rxjs
  timing in the adapter. Not a view-layer rAF shell: grep-gate 29 bans UI
  timers, adapter-side pacing is the exact shape `JARVIS_DELTA` streams in
  phase 2, and it makes the reveal TestScheduler-deterministic. Power-saver
  Freeze ⇒ instant reveal (one full-text delta, via an `instantReveal$` dep
  derived from the power-saver preference); `prefers-reduced-motion` disables
  the CSS animations (orb pulse, core rotation, caret) but text still streams.
- **Dumb UI**: no rxjs/fetch/localStorage in `src/ui` (existing grep gates). Skin
  preference persists through `PreferencesPort` (note the ~10-site preference
  blast radius: adapters ×4, contract, presenter, both bindings, ui-contract,
  fixtures).
- **Performance** (docs/performance.md is binding):
  - Orb: layered core glyph + pre-rendered glow layers; animate `transform: scale()`
    and `opacity` only; no animated `filter`/`box-shadow`; no `var()` inside
    animated transforms; one animation per property per element; idle flicker as a
    long-period keyframe, not JS timers. Steady state must show zero
    `compositeFailed` events — the orb is permanent chrome.
  - Overlay: desk dim is a static semi-opaque layer — **no `backdrop-filter`**
    (its removal was a proven GPU win in this codebase). Core/waveform animations
    run only while the overlay is open and are gated by power-saver Freeze and
    `prefers-reduced-motion` like all other motion.
- **No new package in phase 1.** `@rtc/agent-tools` arrives in phase 3, extracting
  the by-then-proven tool shape (full new-package gate wiring **plus the
  `tsconfig.depcruise.json` line pair**, or its dep-cruiser rules silently never
  fire).

## 4. Phase ladder

| Phase | Adds | Seam exercised |
|---|---|---|
| **P1** (this spec) | Scripted core surface, client-side adapter, both web clients | `JarvisMachine` + `JarvisPort` + dumb UI + motion-core |
| **P2** | `JARVIS_*` WS protocol + server-side `ScriptedAgentLoop` behind an `AgentLoop` port (`RTC_JARVIS_FAKE=1`); client gains `WsJarvisAdapter` | wire choreography (parent §3.3), adapter swap |
| **P3** | `@rtc/agent-tools` package + real Anthropic tool-runner loop; availability gating by key | the tool registry (parent §3.1–§3.3) |
| **P4** | MCP Streamable-HTTP endpoint, same process | second transport (parent §3.4) |
| **P5+** | Scripted-breadth + roadmap items from parent §10: desk control, sentinels, briefing, generative widgets, drills, autoplay… | each names its seam in parent §10 |

## 5. Testing (phase 1)

- **client-core**: `JarvisMachine` unit tests (streaming fold, confirm lifecycle
  incl. timeout via fake timers, skin persistence); `ScriptedJarvisAdapter` tests —
  every intent branch against stub use cases, incl. the execution round-trip.
- **motion-core**: `speechChunks` chunk-math unit tests.
- **ui-contract**: framework-neutral contract specs — orb states + badge, overlay
  open/close (click, ⌘J, Escape), send → scripted reply with reveal, suggestion
  chips, confirm approve/reject/timeout card states, skin switch. Swap-trio runs
  them against both clients; the ≥95% contract-coverage gates stay green.
- **Visual tier**: new scenarios (orb idle/attention, overlay open with seeded
  conversation, confirm card) — react-only golden writers, solid asserts; the
  overlay is full-bleed ⇒ `fullPage: true` or it contributes zero goldens. Freeze
  and reduced-motion variants included.
- **e2e**: one smoke per client suite — open overlay, ask a quote, execute with
  confirm, assert the trade in the blotter. Runs in sim mode: no env flag, no key,
  CI-safe.

## 6. Risks

- **Overlay perf regression** — permanent orb + open-overlay animations must pass
  the docs/performance.md pre-merge checklist (trace with zero `compositeFailed`).
- **Scope creep from the prototype** — the demo has ten more subsystems; §2's
  out-list is the contract. Anything not listed "in" is a later phase.
- **API-shape drift vs phase 2** — mitigated by shaping `JarvisPort` replies to
  match the future `JARVIS_DELTA`/`JARVIS_CONFIRM_*` choreography now (§3).

## 7. Counterfactual check (parent §9)

When phase 1 ships it should be: one machine, one port, two adapters' worth of
composition-root wiring, one dumb overlay + orb per framework, pure chunk math
in motion-core, zero changes to `@rtc/domain` beyond the skin preference, zero
changes to `@rtc/server`. If the
implementation plan needs more than that, revisit this spec before proceeding.
