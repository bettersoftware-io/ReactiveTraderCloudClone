# RN visual harness: a fake ViewModel instead of live simulators

**Status:** design, not built · **Date:** 2026-08-11

## The problem, stated correctly

The RN visual tier screenshots **a live application**. `VisualScenarioHost.tsx`
composes each scenario through `createSimulatorPorts(...)` — the real
composition root, the real domain simulators, real RxJS streams driven by real
clocks and seeded RNGs that keep walking after they are seeded.

The web visual tier does not. `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`
(594 lines) hands the components a **static ViewModel**: fixed snapshots,
no-op intents, no ports, no clocks. Its own comments say what it is —
*"per-symbol static snapshot for screenshots; intents are no-ops"*,
*"static screenshots don't click buttons; no-op is correct"*.

So the two tiers do not share a design. RN diverged, and the divergence has
been paid for in per-simulator patches ever since.

### The patches, and why they are not a design

`PricingSimulator` carries `pricingPinMs`. `TradeStoreSimulator` carries
`blotterSeedBaseMs` (added for `blotter/seeded`, T32). Both exist so a
screenshot can stop time. They are **production domain parameters that exist
for the benefit of a test**, and they only cover the simulators somebody
remembered.

Measured 2026-08-11, three captures each:

| scenario | 1↔2 | 1↔3 | 2↔3 |
|---|---|---|---|
| `equities/markets` | 0.00% | **1.60%** | **1.60%** |
| `equities/trade` | **0.21%** | **0.21%** | 0.00% |
| `equities/blotter` | 0.00% | 0.00% | 0.00% |

`EquityMarketDataSimulator` seeds candles with `mulberry32` — deterministic —
then layers a live `interval(500 ms)` forward walk with **no pin**. Nobody
added one, nothing noticed, and the tier's `DEFAULT_RATIO` of `0.06` (6%) means
both scenarios would have reported **pass** while drifting. For scale: the web
tolerance audit found **1.7%** was loose enough to hide a full
`PreferencesModal` restructure. `markets` drifts **1.6% on its own**.

That is the failure mode of the patch approach: it degrades silently, and the
gate that should catch the degradation is looser than the degradation.

### Why this is not a UI problem

The components are already correct. Phase 5b's review pass verified it directly:
`src/ui` holds no `rxjs`, no `Date`, no RNG — grep-gated in CI — and every value
a component renders arrives through a ViewModel hook. **The non-determinism
never came from the UI.** It comes from the harness choosing to drive dumb
components from a live stochastic source rather than fixed data.

Pinning `EquityMarketDataSimulator` would work, and would be the third patch.
The next simulator would be the fourth.

## The design

Give the RN harness what the web harness already has: a **fake ViewModel**.

```
tests/visual/buildFakeViewModel.ts     ← new; static snapshots + no-op intents
tests/visual/VisualScenarioHost.tsx    ← modified; provides the fake, not sim ports
```

- **Static data.** Every hook returns a fixed value or a fixed array. No
  `Observable` that emits more than once, no `interval`, no `Date.now()`.
- **No-op intents.** `execute`, `submit`, `setSort`, `cycle` and friends do
  nothing. A screenshot does not press buttons.
- **Per-scenario overrides.** A scenario supplies only the slice it renders;
  everything else falls back to a shared default. This is how the web fake
  works, and it is why 594 lines cover a comparable surface.

Determinism stops being something maintained and becomes something **structural**:
there is no path from a clock or an RNG into a screenshot.

### Scope of the surface

`createViewModel` exposes ~108 hooks. A scenario needs only the hooks its screen
touches, so the fake is built incrementally per scenario, not exhaustively up
front. The 22 registered scenarios are the working set.

### What this trades away — stated, not hidden

The current tier proves *"the real composition root wires up and renders"*. A
fake ViewModel proves *"these components render this data correctly"*. That
composition-wiring assertion is genuinely lost from **this** tier.

It is not lost from the project: RN has Gherkin e2e coverage over the real
composition, and `app.config.test.ts` guards the env→ports wiring that has
broken before. The web tier made exactly this trade and relies on its
contract/e2e tiers the same way.

This is a real trade, not a pure win. It is the right one because a
composition-wiring signal that only fires through a 6%-tolerance pixel diff is
a poor instrument for that job, while the determinism cost is paid on every
future scenario.

### Animation is already handled — do not re-solve it

Scenarios seed `powerSaverLevel: "freeze"`, which kills motion at the source
rather than waiting for it to settle. `VisualScenarioHost`'s own doc notes
Freeze is *"safe to pin a golden against"*. No change is needed here; it is
recorded so the next reader does not mistake it for an open question.

## Consequences

1. **`equities/markets` and `equities/trade` become pinnable** with no
   simulator change. They are the acceptance test for this work.
2. **`pricingPinMs` and `blotterSeedBaseMs` become deletable** — 5 references
   across `client-core` and `domain`. Production code stops carrying
   test-only parameters. Removal is a follow-up, not part of the first cut:
   the pins must stay until every scenario that relies on them has moved.
3. **No future simulator can reintroduce the class.** Nothing to remember.

## Non-goals

- Changing any `src/ui` component. They are already correct.
- Changing the capture drivers, the diff core, or `DEFAULT_RATIO`. The
  tolerance question is real but separate — and worth revisiting *after*
  determinism is structural, since a deterministic tier can run a far tighter
  budget than 6%.
- The Maestro (tier 2) driver. Same harness, so it inherits the fix.

## Open question for the plan

**Does `DEFAULT_RATIO` drop once this lands?** A structurally deterministic
tier should assert at or near 0%, matching what `blotter` already reproduces.
Left to the plan, and it should be decided by measurement — re-running the
three-sample sweep after the fake lands — not by assumption. That is the
mistake the web tolerance audit exists to document.
