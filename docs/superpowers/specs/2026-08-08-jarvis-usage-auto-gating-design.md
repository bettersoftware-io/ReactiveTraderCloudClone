# Jarvis Usage Auto-Gating — Governance Round 2 (Design)

**Date:** 2026-08-08
**Workstream:** Jarvis LLM usage governance, round 2 — parent item (2)
(Claude-Code-style usage windows) from the
[round-1 design](2026-08-02-jarvis-brain-picker-usage-display-design.md).
Round 1 (PR #472) shipped the brain picker, the `brains`/`defaultBrain`
availability vocabulary, and the in-memory `UsageMeter`; §18.15 of the
architecture reference records what this round inherits. Item (5)
(multi-provider / BYOK) stays gated on real per-user accounts and is **not**
part of this round.

## 1. Goal

When the estimated cost of the current 5h usage window crosses a budget,
the server narrows which brains it offers — expensive brains first, then
everything real — by pushing the same `JARVIS_AVAILABILITY` collapse that
`RTC_JARVIS_FAKE` already demonstrates, computed from `UsageMeter`'s own
numbers instead of an env flag. The gate lifts itself when the window
rolls. No API-key spend can exceed the configured ceiling by more than one
in-flight turn.

## 2. Decisions (settled during brainstorm, 2026-08-08)

- **Scope: item (2) only.** Item (5) multi-provider/BYOK stays out —
  BYOK is meaningless while the committed demo roster is the only auth
  (one user's key would fund everyone), and multi-provider alone would drag
  a second SDK into the server with no current user need.
- **Budget unit: estimated USD per window** (not tokens, not turns) — the
  meter already derives `estimatedCostUsd` from the committed price table,
  and USD is the only unit that bounds the actual bill: an Opus turn
  drains the budget ~5× faster than a Haiku turn automatically.
- **Two-stage degrade** (not a single cliff, not per-brain affordability):
  at the soft threshold the expensive brains drop (Opus, Sonnet); at 100%
  only Scripted remains. Two comparisons, graceful UX.
- **Full-transparency UX:** gated brains stay visible-but-disabled in the
  picker with a reset time; the footer chip gains a gated state; the Admin
  card shows budget/spent/level; one system transcript line appears when a
  gate frame downgrades the *user's currently selected* brain
  mid-conversation.
- **On by default:** default budget **$1.00 per 5h window** (worst case
  ≈ $4.80/day), soft threshold **0.8**. A bill backstop that ships
  off-by-default protects nothing, and the deployed server already carries
  a real key. `RTC_JARVIS_BUDGET_USD=off` disables gating entirely.
- **In-flight turns always complete.** The gate changes what the *next*
  turn may use; nothing aborts mid-stream. (The final `recordTokens` of a
  turn is typically what trips the threshold — the push happens then.)
- **The meter stays server-wide.** All connections share one budget;
  per-user attribution remains out of scope exactly as in round 1.

## 3. The gate computation (`@rtc/server`)

A new pure function beside `UsageMeter` in
`packages/server/src/services/`:

```ts
export type JarvisGateLevel = "none" | "soft" | "hard";

export interface JarvisGateConfig {
  readonly budgetUsd: number | "off";
  readonly softRatio: number; // 0 < softRatio < 1
}

export function computeGateLevel(
  snapshot: JarvisUsageSnapshot,
  config: JarvisGateConfig,
  nowMs: number,
): JarvisGateLevel;
```

Semantics:

- `config.budgetUsd === "off"` → `"none"`, always.
- **Lazy-roll honesty:** `UsageMeter` rolls its window only when a record
  arrives, so an elapsed window's snapshot still shows the old spend.
  `nowMs >= snapshot.windowEndMs` → `"none"`, regardless of the rows.
  (`windowEndMs` starts at `0`, so a fresh meter is also `"none"`.)
- Otherwise sum `estimatedCostUsd` over `snapshot.currentWindow` (the
  scripted row is always `0` and needs no special-casing):
  `spent >= budgetUsd` → `"hard"`; `spent >= budgetUsd * softRatio` →
  `"soft"`; else `"none"`.

The brains narrowing is a second pure function in the same file (the
availability builder composes both):

- `"none"` → offered brains unchanged (whatever env capability allows).
- `"soft"` → drop `claude-opus-5` and `claude-sonnet-5`; keep
  `claude-haiku-4-5` + `scripted`; `defaultBrain` stays `claude-haiku-4-5`.
- `"hard"` → `["scripted"]`, `defaultBrain: "scripted"`.
- Composition with `RTC_JARVIS_FAKE` / missing key: env capability filters
  FIRST, the gate narrows the result. A gate can only ever *remove* real
  brains, never re-add one env already removed.

## 4. Config (env, server-only)

| var | default | meaning |
|---|---|---|
| `RTC_JARVIS_BUDGET_USD` | `1` | Estimated-USD budget per 5h window; `off` disables the gate |
| `RTC_JARVIS_BUDGET_SOFT_RATIO` | `0.8` | Fraction of budget at which the soft stage trips |
| `RTC_JARVIS_FORCE_GATE` | unset | `soft` \| `hard` — forces the gate regardless of spend (dev/e2e seam, mirrors the `RTC_JARVIS_FAKE` precedent; composes with the fake loop so the whole surface runs with zero tokens) |

Malformed values fall back to the default (and log one line at boot —
name/value only, consistent with the sanitization posture). The deploy
runbook (`docs/running-real-jarvis.md`) gains a budget section.

## 5. Push plumbing (server effects)

Today `JARVIS_AVAILABILITY` is computed per connection at subscribe time.
This round makes it reactive to the gate:

- A single server-lifetime `gateLevel$` stream: `UsageMeter.snapshot$`
  mapped through `computeGateLevel`, `distinctUntilChanged`. (Snapshot
  emissions happen on every `recordTurn`/`recordTokens`, so transitions are
  observed at turn boundaries — exactly the "in-flight turns complete"
  semantics.)
- **Timer-driven lift:** while the level is `"soft"`/`"hard"`, arm one rx
  timer at `snapshot.windowEndMs`; when it fires, re-emit through the same
  `computeGateLevel` path (which now reports `"none"` by the lazy-roll
  rule) so the lifting availability frame is pushed even if nobody talks
  to Jarvis again. One timer per gate episode, not per connection.
- Every `gateLevel$` change pushes a fresh `JARVIS_AVAILABILITY` frame to
  **all** connected sockets (the existing per-connection availability
  effect gains the shared stream as an input); new connections fold the
  current level into their initial frame.

## 6. Wire (`@rtc/shared`, additive)

- `JARVIS_AVAILABILITY` payload gains
  `gate?: { level: "soft" | "hard"; resetsAtMs: number; gated: readonly JarvisBrain[] }`
  — absent when the level is `"none"` (old shape preserved bit-for-bit).
  `gated` lists the brains removed *by the gate* (not ones env removed),
  so the picker can render them disabled-with-reason rather than absent.
- The Admin usage-snapshot payload gains `budgetUsd: number | null`
  (`null` = gating off), `spentWindowUsd: number`, and
  `gateLevel: JarvisGateLevel` so the Admin card renders
  budget/spent/remaining/level beside the rows it already shows.
- `WsJarvisAdapter` re-validates shape and drops malformed `gate` fields
  silently (the P5 `jarvis.command` precedent).

## 7. Client (`client-core` + both web clients)

- **`JarvisMachine`:** already re-resolves `effectiveBrain` on every
  `availability$` emission. New: when an emission carries `gate` and the
  re-resolution *changes the effective brain* while a conversation is
  open, append one system transcript entry (existing toolEvent-style row
  mechanism, `origin: "system"`): "Usage budget reached — continuing on
  Haiku until 15:40." / "…continuing scripted until 15:40." The reset time
  formats `resetsAtMs` in local time. No entry when nothing the user was
  using changed (e.g. a Haiku user during a soft gate).
- **Preferences picker (react + solid):** gated brains render as disabled
  rows with copy "budget window — resets 15:40" (env-removed brains stay
  absent exactly as today; only `gate.gated` rows get the disabled
  treatment).
- **Footer chip:** a gated visual state (distinct color/badge) naming the
  level, e.g. "Haiku · budget-limited" (soft, for a downgraded user) /
  "Scripted · budget exhausted" (hard). Non-downgraded users see their
  chip unchanged.
- **Admin card:** budget line ("$0.81 of $1.00 this window — soft gate at
  $0.80"), level badge, and the existing resets-at/in-memory copy.

## 8. Testing (no Anthropic API calls in CI, as ever)

- **Unit (server):** `computeGateLevel` table tests with injected
  clocks — both thresholds, boundary equality (`>=` at both stages),
  lazy-roll un-gate (`nowMs >= windowEndMs` with stale spend rows),
  fresh-meter `"none"`, `"off"`, malformed-env fallback; brains-narrowing
  composition with env capability (gate never re-adds an env-removed
  brain).
- **Effects (server):** gate transition pushes availability to every
  connected socket; the armed timer lifts the gate at `windowEndMs`
  without any new turn; a mid-turn threshold crossing pushes only at the
  turn's `recordTokens`, never mid-stream; `RTC_JARVIS_FORCE_GATE` forces
  each level.
- **Contract (`@rtc/ui-contract`, swap-trio, both clients):**
  picker-disabled rows with reset copy; chip gated states; the system
  transcript line appears exactly once per downgrade and not for
  unaffected users.
- **E2e (Gherkin, both clients):** one ride on
  `RTC_JARVIS_FORCE_GATE=soft` + the fake loop — picker shows the
  disabled rows, chip shows the gated state, a turn still completes on
  the surviving brain.
- **Live smoke:** untouched — a full 6-turn run spends well under the
  default budget, so the gate never trips during it.

## 9. Out of scope (recorded)

- Item (5) multi-provider / BYOK — still gated on real per-user accounts.
- Per-user budget attribution — one shared server-wide budget, as round 1.
- Persistence of the meter or the gate across restarts — observability
  workstream (a restart zeroes the window, documented in the Admin copy).
- `anthropic-ratelimit-*` headers as a second metering input — unchanged
  round-1 open item.
- RN surfaces (picker/chip/system-line on mobile) — joins the existing RN
  Jarvis backlog items.
