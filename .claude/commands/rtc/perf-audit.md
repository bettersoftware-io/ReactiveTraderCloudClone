---
description: Audit live motion machinery (animations + rAF) per view per power-saver level — asserts freeze is motion-free
argument-hint: [react|solid|both] [freeze|all-levels]
allowed-tools: Bash(pnpm:*), Bash(node:*), Bash(lsof:*), Bash(kill:*), Read
---

Run the repeatable rendering-performance assessment. Arguments: `$ARGUMENTS`
(default: `both all-levels`).

## What this measures, and why it exists

The app is a permanently-animated HUD over a live data stream; the power-saver
**freeze** tier promises *zero* motion machinery for GPU-less Citrix/VDI boxes.
Two leak classes are invisible to every other tier (pixels, jsdom, computed
styles) because they are only observable on a **live, streaming** app:

1. **Churn** — per-quote retriggers spawning fresh `Animation` objects and
   style recalcs (manufactured `CSSTransition`s from a global non-`none`
   `transition-property`, flash keyframes, WAAPI calls past their TS gate).
2. **Residents** — infinite loops held `paused` forever instead of removed.

The instrument is `tests/scripts/motion-audit.ts`: it drives every workspace
view (fx, credit, equities, admin) at each power-saver level, samples
`document.getAnimations()` (CSS animations + CSS transitions + WAAPI, with
timing and target identity) and counts `requestAnimationFrame` registrations.

## Procedure

1. Run the audit (starts its own dev server via `with-server`; ~1–2 min per
   client):

   ```bash
   pnpm perf:motion-audit          # react
   pnpm perf:motion-audit:solid    # solid
   ```

   - `both` (default): run the two commands sequentially, compare.
   - A level filter forwards as
     `pnpm --filter @rtc/tests perf:motion-audit -- --levels freeze`
     (comma-separate for several; `--seconds N` widens the sampling window).
   - Against an already-running client instead:
     `pnpm --filter @rtc/tests exec tsx scripts/motion-audit.ts --url http://localhost:5173`.

2. Read the verdict:
   - **freeze** is asserted by the script itself — any live animation or rAF
     activity lists the offender (`Type:name dur state @ target`, with a
     seen-in-N-of-M-samples count) and exits 1.
   - **off** is inventory: the expected roster (ambient layers, spins,
     pulseDot, tick flashes, rank-glide WAAPI, admin pulses). Flag anything
     NEW here against `docs/performance.md`'s rules (compositor-only
     properties, one animation per property per element).
   - **calm** should show loop animations `paused` and data-feedback flashes
     still `running` — calm kills decoration, keeps feedback.

3. If freeze fails, fix at the source (see the catch-all comment in
   `packages/client-*/src/index.css` and the per-module
   `:root[data-power-saver="freeze"]` overrides), then re-run. The same
   invariant is CI-gated by `powerSaver.spec.ts` ("freeze leaves no animation
   or rAF churn while quotes stream") and the visual tier's freeze contract
   (`freezeContract.ts`), so a local pass here should mean a green gate.

4. Report per client: rAF/s and live-animation count per view per level, any
   deltas between react and solid (same scenario roster — a difference means
   one client has a motion path the other lacks), and any new inventory
   entries since the last audit.

## Interpreting a react-vs-solid comparison

Run both clients and diff the inventories view-by-view. Identical rosters are
expected (solid is a parity port); investigate any animation present in one
client only, and any rAF-rate difference at `off` (both should sit at the
display refresh rate while FLIP/live-metrics loops run).

## Deeper traces

This audit covers motion machinery only. For frame-time / compositor analysis
(`compositeFailed` events, main-thread style churn), follow the profiling
recipe and pre-merge checklist in `docs/performance.md` — that is still a
manual DevTools/tracing workflow.
