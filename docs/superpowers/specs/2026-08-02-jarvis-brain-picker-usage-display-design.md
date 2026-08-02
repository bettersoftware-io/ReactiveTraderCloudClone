# Jarvis Brain Picker + Usage Display — Design

**Date:** 2026-08-02 · **Status:** Approved in conversation (display-only scope), pending spec review
**Parent:** the STATUS ⚪ entry "Jarvis LLM usage governance + model preferences" — this round builds its items (1), (3) and (4) plus the brain picker; item (2) (automatic window gating) is EXPLICITLY OUT and ships later on these rails.

## 1. Goal

Give the user control of *which brain* answers Jarvis (including the free
scripted one, so a depleted credit balance never kills a demo), make the
active brain **visible** in the footer, and **meter** real-model usage into an
Admin-tab panel — with billing still gated Anthropic-side (prepaid PAYG,
auto-reload off; see [running-real-jarvis.md](../../running-real-jarvis.md)).

## 2. Scope decisions (locked in brainstorm, 2026-08-02)

- **Display-only.** No automatic cutoff, no window-based loop swap. Usage is
  measured and shown; running dry manifests as failed turns (existing
  sanitized-error path) until the user flips to Scripted in Preferences or
  tops up.
- **Brain picker includes Scripted** as a first-class choice — the
  run-out-of-tokens demo escape hatch.
- Haiku becomes the **default** real model (5× cheaper than the current
  pinned Opus; assessed in [running-real-jarvis.md](../../running-real-jarvis.md)).
- Any authenticated user may pick any offered brain (incl. Opus). Accepted:
  the PAYG credit balance is the spend ceiling.
- **In-memory metering only** — a server restart zeroes it (documented in the
  Admin panel copy). Persistence belongs to the observability workstream.
- Out: RN surfaces, BYO keys, per-user attribution, multi-provider.

## 3. The brain vocabulary

One flat identifier, used identically on the wire, in preferences, and in
the server allowlist:

```ts
type JarvisBrain = "scripted" | "claude-haiku-4-5" | "claude-sonnet-5" | "claude-opus-5";
```

`JARVIS_BRAIN_ALLOWLIST` is a server-side constant. Anything not on it —
unknown string, absent field, tampered client — resolves to the server's
default for that connection (below). The client never names an arbitrary
model string that reaches the SDK.

## 4. Wire changes (`@rtc/shared`)

All additive; a P4-era client keeps working unchanged.

1. **`JARVIS_AVAILABILITY` payload** grows:
   `{ available: boolean, brains: readonly JarvisBrain[], defaultBrain: JarvisBrain }`.
   - Key present, no fake flag: `brains = ["scripted","claude-haiku-4-5","claude-sonnet-5","claude-opus-5"]`, `defaultBrain = "claude-haiku-4-5"`.
   - `RTC_JARVIS_FAKE=1` (rehearsal override, precedence unchanged — it wins
     over the key): `brains = ["scripted"]`, `defaultBrain = "scripted"`.
   - Neither env: `available: false, brains: [], defaultBrain: "scripted"`
     (orb hidden as today; fields present for shape stability).
2. **`JARVIS_CHAT` payload** grows optional `brain?: JarvisBrain` and
   `effort?: "low" | "medium" | "high"`. Parse seam validates both against
   closed vocabularies (invalid → treated as absent, never an error — matches
   the existing lenient-parse posture for optional fields).
3. **New admin pair**: `CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE` →
   `SERVER_MSG.ADMIN_JARVIS_USAGE` (push on change, coalesced ≤1/s), payload
   in §6.

## 5. Server — per-turn routing, two sessions per connection

`jarvis.effects.ts`'s per-connection state grows from one lazily-created
session to **up to two**, keyed by kind:

- `scripted`: from the `ScriptedAgentLoop` — **always constructible**, even
  when the composed `AgentLoop` is Anthropic (the scripted engine lives in
  `@rtc/shared` and needs no key). Composition passes both loops (or a
  factory pair) into the effects instead of exactly one.
- `anthropic`: from the `AnthropicAgentLoop` — only when the server has one.

Each `jarvis.chat` routes to the session its validated `brain` names
(`scripted` → scripted session; any model id → the Anthropic session, with
the model + effort applied **per turn** to that turn's runner call). Each
session keeps its own history — honest: the scripted transcript is its own
conversation. Turn serialization (the hand-rolled `concatMap`) covers the
connection, not the session, so no two turns run concurrently regardless of
routing. Both sessions dispose in the existing `finalize`.

`AnthropicAgentSession.runTurn` gains per-turn `{model, effort}` options
(defaulted from constants). Implementation checks at build time whether
Haiku 4.5 accepts the `effort` param — if not, effort is applied only where
supported and silently dropped otherwise. Prompt-cache `cache_control`
stays; per-model minimum-prefix differences only affect whether caching
engages, never correctness. **Caveat noted:** switching models mid-session
re-sends the (uncached-for-that-model) prefix — fine at demo scale.

Default flip: `JARVIS_MODEL_ID` (constant, currently `claude-opus-5`)
becomes `JARVIS_DEFAULT_BRAIN = "claude-haiku-4-5"` — so even old clients
that never send `brain` get the 5× saving.

## 6. Server — `UsageMeter` (in-memory)

A small service in `serviceContainer`:

- `recordTurn(brain, usage?)` — called by the Anthropic session with the
  SDK's per-message `usage` (input, output, cache-read, cache-creation
  tokens; summed across runner iterations), and by the scripted path with
  turn-count only (no tokens).
- Rolling **5h windows** (`JARVIS_USAGE_WINDOW_MS = 18_000_000`): the window
  anchors at the first recorded turn after expiry; snapshot exposes current
  window start/end, per-brain token totals + turn counts for the current
  window AND since boot, and an **estimated cost** from a static price table
  (`$/Mtok` in/out, cache-read at 10% of input) — display-only estimate,
  clearly labelled.
- Pure TS, fully unit-tested with injected clock. No persistence.

The admin effect subscribes a connection to meter snapshots; pushes are
change-driven and coalesced.

## 7. Preferences (`@rtc/domain` + all the usual sites)

Two new persisted preferences: `jarvisBrain: JarvisBrain` (default
`claude-haiku-4-5`) and `jarvisEffort: "low" | "medium" | "high"` (default
`medium`).

**This round deliberately touches `@rtc/domain`** — the P1–P4 "domain stays
byte-identical" headline was a Jarvis-transport constraint, not a global
law, and preferences legitimately live in the domain preference model.
Budget the known ~10-site blast radius (preference type + both storage
adapters + contract + presenter + both bindings + ui-contract fixtures…).

**Preferences modal** gains a Jarvis section: a brain picker (four options;
real-model options **disabled** when not in the availability `brains` list,
with a short "server offers no live model" hint) and an effort segmented
control (disabled when `jarvisBrain === "scripted"`). Both web clients,
pixel-parity, dumb UI as always.

**Resolution rule (client, in `JarvisMachine`):** effective brain =
preferred brain if offered, else `defaultBrain` from availability. The
adapter sends the *effective* brain on each `jarvis.chat`. Mid-session
preference changes apply from the next message (no teardown).

## 8. Footer chip (both web clients)

A new live segment in the existing `StatusBar` (`ui/shell/status/`), driven
by `JarvisMachine` state (availability + effective brain):

- `JARVIS · Haiku 4.5` (or the friendly name of the effective model)
- `JARVIS · scripted`
- segment hidden when `available: false` (mirrors the orb).

Friendly names come from a small shared map (extend the existing
`JARVIS_TOOL_FRIENDLY_NAMES` pattern, not ad-hoc strings in UI). Contract
specs shared via `@rtc/ui-contract`; new visual scenarios for the chip +
prefs section follow the 5-edit recipe, with the golden regen dispatch at
ship time.

## 9. Admin panel

A new card in the Admin tab: current-window per-brain rows (turns, input /
output tokens, est. cost), window countdown, since-boot totals, and the
"metrics reset on server restart" caveat line. Driven by the new admin
usage stream through the standard presenter/machine path (no rxjs in UI).
Sim-mode (no server): the panel shows the scripted-only, zero-cost shape —
the in-browser sim adapter answers the subscribe with an empty snapshot.

## 10. Testing strategy (no API calls in CI, as ever)

- `UsageMeter` unit tests (window roll, cost table, injected clock).
- Parse-seam tests for `brain`/`effort` validation (tamper → default).
- ws-effects tests: routing (scripted turn while Anthropic configured, model
  override reaching a faked RunnerFactory, per-connection dual sessions,
  serialization across brains, dispose of both).
- Availability payload tests for all three env shapes.
- Contract specs (shared, both frameworks): prefs section enable/disable
  logic, footer chip states, admin panel render.
- `JarvisMachine` tests: effective-brain resolution, availability fold.
- Live smoke gains an optional brain assertion (still manual/key-gated).

## 11. Open items (recorded, not blocking)

- Auto window-gating (parent item 2) builds directly on `UsageMeter` +
  the brains vocabulary: exhaustion just removes real models from `brains`
  and pushes a fresh availability — designed for, not built.
- `anthropic-ratelimit-*` headers as a second metering input — later.
- Persistence / cross-restart usage — observability workstream.
