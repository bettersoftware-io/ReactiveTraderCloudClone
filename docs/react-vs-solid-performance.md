# React vs Solid: measured runtime cost

**Question answered here:** does SolidJS bring significant performance benefits
for this app, or does React 19 with the React Compiler perform just as well?

**Verdict (2026-07-29): React + Compiler is competitive — there is no
significant performance argument for preferring Solid in this app.** Solid's
raw scripting is 2–3× cheaper on streaming updates, but scripting is a small
slice of total main-thread work, and the totals land within ±15% on most
scenarios. Each side has one clear edge (details below), neither ever produced
a single long task (>50ms), and both sit at a few percent of one core under
full streaming load. Framework choice here is a DX/architecture decision, not
a performance one.

## How to reproduce

```bash
pnpm build                                  # prod dist for both clients
pnpm perf:framework-compare                 # both clients, freeze, 3 trials
pnpm perf:framework-compare -- --levels freeze,off --trials 5 --seconds 10
```

`tests/scripts/framework-compare.ts` serves each client's **production build**
(`vite preview`) — dev-server overhead differs hugely between the frameworks
and would bias the result — and drives identical scripted scenarios in
Chromium, reporting per-scenario medians of CDP `Performance.getMetrics`
deltas plus a long-task observer.

Method notes:

- **Power-saver freeze is the primary condition.** The motion audit proves
  freeze is motion-free in both clients, so no CSS animation, rAF loop, or
  WAAPI churn pollutes the numbers — what remains per quote tick is the
  framework's update path (shared `client-core` streams are identical). `off`
  is kept as a secondary condition; it adds the (shared `motion-core`) rAF
  work and compositor noise.
- Both clients run the same in-browser simulator, seeded session, same
  machine, sequentially, N trials, medians. Keep the machine otherwise idle:
  the clients run one after the other, so background load biases whichever
  ran during it.
- The React bundle has the React Compiler enabled (see
  `packages/client-react/vite.config.ts`) — this comparison is Solid vs
  *compiled* React, which is the choice that actually exists in this repo.

## Scenarios

| scenario | what it stresses |
|---|---|
| `stream-fx` | many independent price cells updating — fine-grained vs VDOM |
| `stream-equities` | watchlist re-ranks + chart appends — keyed list updates |
| `chart-crosshair` | pointermove-driven overlay re-render per event |
| `chart-zoom` | wheel notches rescaling the viewport (20%/notch) |
| `chart-navigator-drag` | brush drag — viewport re-derived per pointermove |
| `view-switch` | full panel-tree mount/unmount cycles |

## Results (2026-07-29, arm64 macOS, medians of 3, freeze)

Main-thread milliseconds over the scenario window (8s for the stream
scenarios); ratio is solid/react, lower = solid cheaper.

| scenario | task ms r / s (ratio) | script ms r / s (ratio) | layout count r / s |
|---|---|---|---|
| stream-fx | 485 / 420 (0.87) | 145 / 82 (0.56) | 158 / 156 |
| stream-equities | 216 / 239 (1.10) | 100 / 93 (0.93) | 42 / 37 |
| chart-crosshair | 223 / 200 (0.90) | 62 / 22 (0.35) | 123 / 127 |
| chart-zoom | 162 / 153 (0.95) | 39 / 41 (1.06) | 29 / 28 |
| chart-navigator-drag | 125 / 204 (**1.64**) | 56 / 57 (1.03) | **9 / 67** |
| view-switch | 552 / 536 (0.97) | 162 / 139 (0.86) | 92 / 89 |

Long tasks (>50ms): **zero, everywhere, both clients, both levels.**
JS heap at end: solid consistently 20–40% lower (e.g. 9.2 → 6.7 MB on
stream-fx). The `off` run shows the same shape throughout (drag ratio 1.84;
crosshair script ratio 0.36).

## Findings

1. **Neither framework is anywhere near jank.** Zero long tasks across every
   scenario, level, and trial; under full streaming the busiest scenario
   costs ~0.5s of main thread per 8s window (~6% of one core) in either
   client. At this app's (conflated) data rates the framework layer is not
   the bottleneck — the presenter/stream layer and CSS motion (see
   [performance.md](performance.md)) dominate the budget.
2. **Solid's fine-grained updates do win raw scripting** — 0.35–0.68× on the
   streaming and crosshair scenarios. But script is a minor slice of task
   time (layout + style recalc are similar in both), so the end-to-end gap
   mostly evaporates: totals within ±15% except the drag.
3. **React wins the navigator drag outright** (0.6× total, 4–7× fewer layout
   passes, both levels). Identically-ported brush logic (rect cached at
   pointerdown in both), so the gap is the update model: React's batched
   commits coalesce high-frequency pointermoves into few DOM writes; Solid
   applies each move synchronously and pays a layout per applied change.
4. **Solid retains far more DOM nodes** (CDP live-node count 1.5–5× React's,
   spiking after chart interactions — 4,676 vs 1,065 after zoom). The metric
   counts detached-but-referenced nodes, so this smells like the solid chart
   retaining replaced SVG nodes. Its heap is *lower*, so it is not a byte
   leak — but it deserves its own investigation (logged in STATUS.md).

## Caveats

- One machine, one browser, simulator data rates. Absolute numbers will scale
  up on weak hardware (the GPU-less Citrix case), but the *ratios* are the
  transferable signal.
- Medians of 3 on a workstation, not a cleanroom. Re-run with
  `--trials 5 --seconds 10` before treating a <15% delta as real.
- This measures runtime cost only — bundle size, memory ceilings on long
  sessions, and DX are separate axes.
