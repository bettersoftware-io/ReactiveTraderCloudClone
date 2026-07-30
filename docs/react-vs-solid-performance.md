# React vs Solid: measured runtime cost

**Question answered here:** does SolidJS bring significant performance benefits
for this app, or does React 19 with the React Compiler perform just as well?

**Verdict (2026-07-30): parity, in both directions.** Solid's raw scripting
is 2–3× cheaper on streaming updates, but scripting is a small slice of total
main-thread work and the totals land within ±15% on most scenarios; neither
client ever produces a long task (>50ms) at normal speed. The one real
pathology found — the Solid chart's interaction path costing 3.45× React's
main thread on emulated slow hardware, felt as sluggishness on the GPU-less
Citrix boxes freeze exists for — was root-caused to two Solid-specific traps
(reference-keyed `<For>` DOM recreation and no input-pressure load-shedding)
and **fixed on 2026-07-30**: `<Index>` slots + an adaptive frame-coalesced
viewport write bring it to 1.24× under 8× CPU throttle with layout counts
matching React's. Framework choice here is a DX/architecture decision, not a
performance one — but only because both clients now handle continuous input
well; the traps below are real and worth knowing.

## How to reproduce

```bash
pnpm build                                  # prod dist for both clients
pnpm perf:framework-compare                 # both clients, freeze, 3 trials
pnpm perf:framework-compare -- --levels freeze,off --trials 5 --seconds 10
pnpm perf:framework-compare -- --cpu-throttle 8   # emulate GPU-less/VDI hardware
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

## Results (2026-07-30, arm64 macOS, medians of 3, freeze — after the chart fixes)

Main-thread milliseconds over the scenario window (8s for the stream
scenarios); ratio is solid/react, lower = solid cheaper.

| scenario | task ms r / s (ratio) | script ms r / s (ratio) | layout count r / s |
|---|---|---|---|
| stream-fx | 609 / 566 (0.93) | 193 / 113 (0.59) | 162 / 155 |
| stream-equities | 279 / 253 (0.91) | 133 / 113 (0.86) | 45 / 36 |
| chart-crosshair | 232 / 220 (0.95) | 64 / 25 (0.39) | 122 / 127 |
| chart-zoom | 176 / 194 (1.11) | 43 / 50 (1.15) | 31 / 30 |
| chart-navigator-drag | 110 / 146 (1.33) | 50 / 70 (1.42) | 9 / 7 |
| view-switch | 591 / 639 (1.08) | 172 / 154 (0.90) | 89 / 84 |

Long tasks (>50ms): **zero, everywhere, both clients, at normal speed.**
JS heap at end: solid consistently 15–30% lower. (The pre-fix 2026-07-29
run had the drag at 1.64× with **67** solid layout passes and chart DOM-node
counts 3–14× React's — see finding 3.)

### Emulated slow hardware (`--cpu-throttle 8`, the Citrix/VDI case)

The condition that matters for freeze's target machines — and where the
Solid chart's pre-fix pathology actually lived:

| chart-navigator-drag @ 8× | react | solid PRE-fix | solid POST-fix |
|---|---|---|---|
| task ms (total main thread) | 355 | **1223 (3.45×)** | **441 (1.24×)** |
| layout count | 8 | 72.5 | 8.5 |
| layout ms | 12.9 | 130 | 9.7 |
| DOM nodes (end) | 1077 | **15,372** | 1370 |

Every other scenario at 8× throttle: solid ties or wins (0.74–0.94 pre-fix,
unchanged-or-better post-fix). The drag was the single outlier — matching
the field report that only the chart felt sluggish on real Citrix hardware.

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
3. **The Solid chart's interaction pathology — found on real Citrix
   hardware, root-caused and fixed 2026-07-30.** Two compounding
   Solid-specific traps, invisible at normal speed and crippling on slow
   machines (drag at 3.45× React's main-thread cost under 8× CPU throttle,
   felt as a sluggish chart in the field while every other view was fine):

   - **Reference-keyed `<For>` over per-update-recreated vm arrays rebuilds
     the DOM every update.** `chartVm` derives fresh candle/grid/label/bar
     objects on every viewport change, so `<For>` (which keys by object
     identity) disposed and recreated the entire visible chart DOM per
     zoom/pan step — thousands of nodes per gesture (CDP node census hit
     15,372 vs React's 1,077 after one throttled drag), plus a forced
     layout per event from the structural churn. React never hits this: its
     VDOM diff updates attributes in place. **Fix: `<Index>`** — slots keyed
     by position whose bindings update in place; the DOM is created once
     and only attributes change. Layout count per drag fell 67 → 7,
     matching React.
   - **No input-pressure load-shedding.** React's scheduler coalesces
     continuous-priority (pointermove) updates when the machine falls
     behind — rendering the latest position at the achievable rate. Solid
     applies every event synchronously, so on slow hardware it renders
     stale intermediate positions late, which *feels* laggy. **Fix:** an
     adaptive leading-edge + trailing-frame coalescer on the gesture seam's
     viewport writes (`createChartGestures.writeViewportThrottled`) —
     latest-wins per frame. On fast hardware frames outpace events and it
     is a no-op (probe-verified: 62 rAFs fired between 63 events); on slow
     hardware frames stretch and stale updates drop, exactly React's
     policy. Full-fidelity feedback when the machine can afford it,
     load-shedding when it can't.

   Post-fix, the drag sits at 1.33× React at normal speed (full frame-rate
   fidelity vs React's input-pressure batching — a QoS difference, not
   waste) and 1.24× under 8× throttle with matched update counts.
4. **The "retained DOM nodes" observation was the `<For>` churn, not a
   leak.** The CDP node census counts detached-but-not-yet-collected nodes;
   the recreate-per-update chart DOM manufactured garbage faster than GC
   collected it (heap stayed *lower* than React's throughout — node
   objects, not bytes). Post-`<Index>`, chart scenarios end at ~1.5–1.8×
   React's node count (from 3–14×), with the residual tracking GC timing.
   Closed with the fix.

## Caveats

- One machine, one browser, simulator data rates. `--cpu-throttle N`
  (CDP emulation) approximates weak hardware well — it reproduced the
  field-reported Citrix chart sluggishness as a 3.45× drag ratio — but it
  scales CPU only, not the missing GPU.
- Medians of 3 on a workstation, not a cleanroom. Re-run with
  `--trials 5 --seconds 10` before treating a <15% delta as real.
- This measures runtime cost only — bundle size, memory ceilings on long
  sessions, and DX are separate axes.
