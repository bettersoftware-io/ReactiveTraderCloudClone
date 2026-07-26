# RN mobile-v1 rehaul — Phase 5c: Analytics

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `@rtc/client-react-native`'s Analytics module to mobile-v1 prototype fidelity — correct formatters, a Skia P&L area chart, animated pair bars, Skia exposure bubbles with breathing motion, and the prototype's card order.

**Architecture:** Presentation-only over a frozen data seam. Data reaches the UI solely through `useViewModel()`'s `useAnalytics()` / `useAnalyticsStaleFlag()`. The one exception is Task 1, which fixes a **simulator** defect below the UI — see why below.

**Tech Stack:** React Native 0.86 / Expo SDK 57, `@shopify/react-native-skia` (declarative, not the recorder), `react-native-reanimated`, `@rtc/domain` formatters, vitest (pure) + jest-expo (components).

**Design:** [../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md](../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md) §3.3, §5c, §6.

---

## Why Task 1 comes first, and why it is not scope creep

The design freezes the data seam (§4) and this plan honours that — **except** for one simulator constant, because it decides whether most of this sub-phase is worth building.

`AnalyticsSimulator` emits `currentPositions: STATIC_POSITIONS` — the *same frozen array object* on every emission, at `AnalyticsSimulator.ts:107` (initial) and `:124` (each 10 s update). Two of this sub-phase's four surfaces read `currentPositions`:

- **Exposure bubbles** — the breathing size tween has nothing to breathe about
- **Pair P&L bars** — the 800 ms bar tween never runs after first paint

So without M6, half of 5c animates a constant. The design records M6 as **DECIDED 2026-07-26 — positions will drift**, and explicitly re-scoped it "a task inside 5c rather than a gate on planning it". This is that task.

It is also the highest-leverage change in the plan: `AnalyticsSimulator` sits below both clients, so **the web analytics dashboard gets live positions for free**.

---

## Global Constraints

Every task's requirements implicitly include this section.

**1. The data seam is frozen apart from Task 1.** No changes to `@rtc/domain`'s public types, `@rtc/client-core`, `@rtc/react-bindings`, or the wire protocol. Task 1 changes only the simulator's *emission*, not the `PositionUpdates` shape.

**2. Banned literal tokens under `src/ui`.** Never write `setTimeout`, `setInterval`, `localStorage`, `fetch`, or `rxjs` — **including inside comments**. The CI gates are plain greps over prose, so a comment mentioning one fails the build.

**3. Skia draw parameters are NOT React Native layout properties.** `docs/performance.md` bans animating layout on RN views — but a circle's `r` or a path's geometry inside a Skia canvas is a draw parameter, not layout, and is legal to animate. Stated explicitly because it is easy to over-apply the rule and end up animating nothing.

**4. Do NOT reach for `createPicture` + `useDerivedValue`.** That recorder pattern exists for clock-driven geometry (the boot scenes, 60 fps). Analytics history appends **every 10 seconds** and is ~90 point operations. Build the `SkPath` in a plain `useMemo` on the JS thread during the ordinary re-render and pass it to a declarative `<Path>`. The only place a shared value earns its keep here is the bar and bubble tweens.

**5. Worklet marking is transitive, and jest cannot see it.** Any function reached from inside a Reanimated worklet must carry `"worklet"` itself, including `@rtc/motion-core` helpers. The simulator is the only witness (#334, #340).

**6. Motion gates on `useShellMotionEnabled()`.** When off, render the static end-state — never a mid-tween frame.

**7. Styling through `useThemedStyles(makeStyles)`.** All colours from theme tokens; no hardcoded hex.

**8. Horizontal chip rows need `flexGrow: 0` / `flexShrink: 0` plus `alignItems: "center"`**, or they stretch into full-height bars on short content — the Phase 4a bug.

**9. Against live data these surfaces move far more slowly than the prototype's 1 s decorative mock.** Expect that in review; it is correct, and M7 records the cadence mismatch as a separate model question.

**10. `pnpm exec biome ci .`, not `pnpm lint`.** The local `lint` script is lint-only; CI additionally enforces formatting and import order.

---

## File Structure

```
packages/domain/src/simulators/
  AnalyticsSimulator.ts          # MODIFY — Task 1 only

packages/client-react-native/src/ui/analytics/
  AnalyticsScreen.tsx            # MODIFY — card order, formatter swap
  PnlValue.tsx                   # MODIFY — formatPnlHeadline
  PnlChart.tsx                   # REWRITE — Skia area chart
  buildChart.ts                  # EXTEND  — area path + last point
  PairPnlBars.tsx                # MODIFY — scaleX tween, formatPnlK
  ExposureBubbles.tsx            # REWRITE — Skia + breathing
  bubbleLayout.ts                # UNCHANGED — shelf-packing stays (§3.3)
```

`bubbleLayout.ts` is deliberately untouched: the design locked shelf-packing because it scales past 7 currencies, is deterministic (which a pinned golden needs), and is already tested.

---

## Task 1: Make positions drift (M6)

**Files:**
- Modify: `packages/domain/src/simulators/AnalyticsSimulator.ts`
- Test: `packages/domain/src/simulators/AnalyticsSimulator.test.ts`

**Why:** see the section above. Without this, Tasks 4 and 5 animate a constant.

**What must NOT change:** `STATIC_POSITIONS`' *initial* values are load-bearing and documented in the file's own header — they make `netExposureByCurrency()` land exactly on the prototype's bubble figures (EUR +15.2M, USD −22.8M, JPY +8.4M, GBP −6.1M, AUD +4.7M, CAD −3.2M, NZD +2.1M) and the per-pair bars after `formatPnlK`. **The first emission must still be exactly those values** — otherwise every pinned golden and the prototype comparison move. Only *subsequent* emissions drift.

- [ ] **Step 1: Write the failing test**

```ts
test("the first emission is exactly the prototype-calibrated positions", async () => {
  const simulator = new AnalyticsSimulator();
  const first = await firstValueFrom(simulator.getAnalytics("USD"));

  expect(first.currentPositions.map((p) => { return p.symbol; })).toStrictEqual(
    STATIC_POSITIONS.map((p) => { return p.symbol; }),
  );
  expect(first.currentPositions).toStrictEqual(STATIC_POSITIONS);
});

// The defect: every emission returned the SAME frozen array, so two of the
// analytics surfaces animated a constant.
test("later emissions drift rather than repeating the frozen constant", async () => {
  const simulator = new AnalyticsSimulator();
  const emissions = await firstValueFrom(
    simulator.getAnalytics("USD").pipe(take(3), toArray()),
  );

  expect(emissions[1].currentPositions).not.toStrictEqual(
    emissions[0].currentPositions,
  );
});

test("drift keeps the symbol set and its order stable", async () => {
  const simulator = new AnalyticsSimulator();
  const emissions = await firstValueFrom(
    simulator.getAnalytics("USD").pipe(take(3), toArray()),
  );

  for (const update of emissions) {
    expect(update.currentPositions.map((p) => { return p.symbol; })).toStrictEqual(
      STATIC_POSITIONS.map((p) => { return p.symbol; }),
    );
  }
});

// A random walk that can wander without bound would eventually make one bubble
// swamp the layout and push the bars off scale.
test("drift stays bounded near the calibrated values", async () => {
  const simulator = new AnalyticsSimulator();
  const emissions = await firstValueFrom(
    simulator.getAnalytics("USD").pipe(take(40), toArray()),
  );

  for (const update of emissions) {
    for (let i = 0; i < update.currentPositions.length; i++) {
      const drifted = update.currentPositions[i];
      const origin = STATIC_POSITIONS[i];

      expect(Math.abs(drifted.basePnl)).toBeLessThan(
        Math.abs(origin.basePnl) * 3 + 1,
      );
    }
  }
});
```

> **Before running:** the suite must use fake timers to step the 10 s interval —
> follow whatever `AnalyticsSimulator.test.ts` already does for `history`, which
> is driven by the same `interval(UPDATE_INTERVAL_MS)`. Export `STATIC_POSITIONS`
> if it is not already exported, or reproduce the expected symbol list literally.

- [ ] **Step 2: Run it and watch the drift tests fail** — the first-emission test should already pass.

```bash
pnpm --filter @rtc/domain exec vitest run src/simulators/AnalyticsSimulator.test.ts
```

- [ ] **Step 3: Implement bounded drift.**

Keep `STATIC_POSITIONS` as the calibration origin. Hold a mutable `currentPositions` seeded from it, and on each interval tick walk each position's `basePnl` (and whatever `netExposureByCurrency` reads) by a small bounded step — mirroring the existing `randomWalkStep` the history already uses, so the file gains no new randomness idiom.

**Emit a fresh array**, not a mutated one: `PositionUpdates` flows into React, and mutating a captured array in place means referential equality holds and nothing re-renders. That failure mode is silent.

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Check the web client still reads correctly.** `AnalyticsSimulator` feeds both clients; the web analytics dashboard now gets live positions too. Confirm its tests still pass.

```bash
pnpm --filter @rtc/domain test && pnpm --filter @rtc/client-react test
```

- [ ] **Step 6: Commit.**

```bash
git commit -m "fix(domain): let analytics positions drift instead of re-emitting a frozen constant (M6)"
```

---

## Task 2: Correct the P&L formatters

**Files:**
- Modify: `packages/client-react-native/src/ui/analytics/PnlValue.tsx`
- Modify: `packages/client-react-native/src/ui/analytics/PairPnlBars.tsx`
- Test: their existing `*.test.tsx`

**The defect:** `@rtc/domain` ships prototype-exact `formatPnlHeadline` and `formatPnlK` (`analytics/formatPnlHeadline.ts`), which the **web client already uses correctly**. RN imports the older `formatPnlValue` and `formatWithScale` instead. Near-zero risk, and it makes the two clients agree.

- [ ] **Step 1: Read both formatter pairs** before changing anything — `formatPnlHeadline.ts` and `formatPnlValue.ts` / `formatScale.ts` — and write down the exact output difference for at least: a large positive, a large negative, a sub-thousand value, and zero. The tests below must encode the **new** outputs, transcribed, not guessed.

- [ ] **Step 2: Write the failing tests** in `PnlValue.test.tsx` and `PairPnlBars.test.tsx`, asserting the prototype-exact strings.

- [ ] **Step 3: Run them and watch them fail.**

- [ ] **Step 4: Swap the imports** — `formatPnlValue` → `formatPnlHeadline` in `PnlValue.tsx`, `formatWithScale` → `formatPnlK` in `PairPnlBars.tsx`.

- [ ] **Step 5: Run the tests** — Expected: PASS.

- [ ] **Step 6: Grep for any other RN use of the old formatters**, so the module is internally consistent:

```bash
grep -rn "formatPnlValue\|formatWithScale" packages/client-react-native/src
```

- [ ] **Step 7: Gauntlet + commit.**

---

## Task 3: Skia P&L area chart

**Files:**
- Rewrite: `packages/client-react-native/src/ui/analytics/PnlChart.tsx`
- Extend: `packages/client-react-native/src/ui/analytics/buildChart.ts` (+ `.test.ts`)
- Test: `PnlChart.test.tsx`

**Today:** `react-native-svg` with a stroked line and a dashed zero baseline. `buildChart` already returns `{ path, zeroY }` and is a verbatim port of the web's — **keep its line maths exactly**; this task adds to it, it does not re-derive it.

**Target:** line + **area fill** + dashed zero baseline + **last-point dot**. Zero is always forced into the Y domain (it already is — confirm and pin it with a test rather than assuming).

- [ ] **Step 1: Write the failing test for the area path**

```ts
// The area is the line path closed down to the zero baseline — not to the
// bottom of the chart. Closing to the bottom looks almost right and is wrong
// whenever P&L goes negative, which is exactly when the chart matters.
test("the area path closes back to the zero baseline, not the chart floor", () => {
  const shape = buildChart(HISTORY_CROSSING_ZERO);

  expect(shape.areaPath).not.toBe("");
  expect(shape.areaPath.startsWith(shape.path)).toBe(true);
  expect(shape.areaPath.trimEnd().endsWith("Z")).toBe(true);
});

test("zero is always inside the Y domain, even when P&L never crosses it", () => {
  expect(buildChart(ALL_POSITIVE_HISTORY).zeroY).not.toBeNull();
  expect(buildChart(ALL_NEGATIVE_HISTORY).zeroY).not.toBeNull();
});

test("the last point is exposed so the dot can be drawn without re-deriving it", () => {
  const shape = buildChart(HISTORY_CROSSING_ZERO);

  expect(shape.lastPoint).not.toBeNull();
  expect(shape.lastPoint?.x).toBeCloseTo(CHART_WIDTH - 8);
});

test("too few points yields no path, no area and no dot", () => {
  const shape = buildChart([]);

  expect(shape.path).toBe("");
  expect(shape.areaPath).toBe("");
  expect(shape.lastPoint).toBeNull();
});
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Extend `buildChart`** with `areaPath` and `lastPoint`, leaving the existing `path`/`zeroY` maths byte-identical. Its existing tests must still pass unchanged — that is the guard that the line did not move.

- [ ] **Step 4: Run the tests** — Expected: PASS, including the pre-existing ones.

- [ ] **Step 5: Rewrite `PnlChart.tsx` on Skia.** Declarative `<Canvas>` with `<Path>` — **not** `createPicture` (constraint 4). Build the `SkPath` from `buildChart`'s `d` strings inside a `useMemo` keyed on `history`; `Skia.Path.MakeFromSVGString` accepts them directly, so the existing string maths is reused rather than rewritten as path calls.

  Area fill uses a vertical `LinearGradient` from the line colour at ~0.35 alpha to transparent. Stroke colour still flips positive/negative on the last value.

- [ ] **Step 6: Write `PnlChart.test.tsx`** — mounts with a realistic history, with an empty history, and with a single point (the degenerate case where there is no path at all).

- [ ] **Step 7: Run the tests, then gauntlet + commit.**

---

## Task 4: Pair P&L bars — scaleX tween

**Files:**
- Modify: `packages/client-react-native/src/ui/analytics/PairPnlBars.tsx` (+ test)

**Today:** a `View` whose `flex` is set to the value fraction — i.e. animating **layout**, which the perf doctrine bans and which cannot run on the UI thread.

**Target:** the prototype's 800 ms `cubic-bezier(0.3, 0.9, 0.3, 1)` tween, as **`transform: scaleX` from a fixed-width track**.

- [ ] **Step 1: Write the failing test.** Assert the bar reaches its resting scale for a given fraction, that a zero-P&L pair does not vanish entirely (a `scaleX(0)` bar disappears — check what the prototype does at zero and match it), and that with motion disabled the bar renders at its final scale immediately.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Fixed-width track; the bar is full-width and scaled. **Set `transformOrigin` (or an equivalent anchor offset) so the bar grows from the centre line outward**, matching the existing centre-line layout — a default centre-origin scaleX on a full-width bar grows in both directions, which is not what the current layout shows.

  Easing: `Easing.bezier(0.3, 0.9, 0.3, 1)`, duration 800. Gate on `useShellMotionEnabled()` (constraint 6).

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Verify against Task 1.** With positions now drifting, the bars should visibly retween every 10 s. If they do not, the array is being mutated in place rather than replaced (Task 1, Step 3) — fix that, not this.

- [ ] **Step 6: Gauntlet + commit.**

---

## Task 5: Skia exposure bubbles with breathing

**Files:**
- Rewrite: `packages/client-react-native/src/ui/analytics/ExposureBubbles.tsx` (+ test)
- **Unchanged:** `bubbleLayout.ts` — shelf-packing is locked (§3.3)

**Today:** `react-native-svg` `<Circle>` + `<SvgText>` over `computeBubbleLayout(aggregatePositionsByCurrency(positions))`.

**Target:** the same layout, drawn in Skia, with a breathing size tween as exposures drift.

- [ ] **Step 1: Write the failing test.** Assert every currency still gets a bubble and a label, that positive/negative take the right accent, that the layout call is unchanged (same inputs → same placements), and that with motion disabled bubbles render at their resting radius.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Declarative Skia `<Canvas>`; `<Circle>` per bubble with an animated `r` — legal, because `r` is a **draw parameter, not layout** (constraint 3). Labels via Skia text, which needs a real typeface: reuse the `bootSceneFonts.ts` idiom (`useFont`, built in React-land, never inside a worklet) rather than `Skia.Font()`, which draws **zero glyphs silently on device** (P1).

  **Check every glyph against the bundled cmap before drawing it.** Currency codes are plain ASCII and safe, but if any label gains a symbol, verify it — the web rendering it is not evidence (P1a).

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Gauntlet + commit.**

---

## Task 6: Card order + screen integration

**Files:**
- Modify: `packages/client-react-native/src/ui/analytics/AnalyticsScreen.tsx` (+ test)

**The defect:** the screen renders **P&L → Exposure → Pair P&L**. The prototype is **P&L → Pair P&L → Exposure**.

- [ ] **Step 1: Write the failing test** asserting the rendered order of `analytics-widget-pnl`, `analytics-widget-pairs`, `analytics-widget-exposure`.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Reorder the cards.** Nothing else — the widgets are self-contained.

- [ ] **Step 4: Check the e2e/testID impact.** Per the design's §9, Analytics testIDs **should be grep-checked before renaming**; this task does not rename any, but it does reorder them, so confirm nothing asserts positional order:

```bash
grep -rn "analytics-widget" packages/ tests/ --include=*.ts --include=*.tsx
```

- [ ] **Step 5: Run the tests, then gauntlet + commit.**

---

## Task 7: Visual scenario + docs

**Files:**
- Modify: `packages/client-react-native/tests/visual/scenarioIds.ts`, `tests/visual/scenarios.tsx`
- Regenerate: `tests/visual/maestro/flows/`
- Modify: `docs/rn-open-items.md`, `docs/STATUS.md`

- [ ] **Step 1: Register an `analytics/dashboard` scenario**, pinned — never live (the boot-scene rule applies here too: a free-running surface cannot be a stable golden).

  **Task 1 makes this sharper, not looser.** Positions now drift, so the scenario must pin the fixture state rather than mount against a live simulator. If pinning proves impossible with the current harness, **do not register a drifting scenario** — record the reason as T10 was, rather than adding a permanently-flaky golden.

- [ ] **Step 2: Regenerate the Maestro flows** — the committed tree is guarded, so adding a scenario id without this turns `generateFlows.test.ts` red:

```bash
pnpm --filter @rtc/client-react-native exec tsx tests/visual/maestro/generateFlows.ts
```

- [ ] **Step 3: Confirm `scenarios.test.tsx` passes.**

- [ ] **Step 4: Update the docs.** Close M6 in `rn-open-items.md` §8.1 (it is now fixed, and note that the web client benefits too). Record 5c as built in `STATUS.md`, and be explicit that **the on-device sign-off has not happened** — 5c does not close without it.

- [ ] **Step 5: Full gauntlet** — `/rtc:gauntlet full`.

- [ ] **Step 6: Commit.**

---

## Task 8: On-device sign-off (requires the user + a booted simulator)

**This task cannot be completed by an agent alone.** It needs a Mac with a booted iPhone 17 / iOS 26.5 simulator, the dev client installed, Metro running with `EXPO_PUBLIC_VISUAL_HARNESS=1`, and **a human looking at the screen**.

It queues into the single serial native tail the design describes (§2) — one simulator, one Metro port, one dev client — so it cannot run in parallel with 5a's or 5b's sign-off.

- [ ] **Step 1: Run the Analytics screen on device** and watch a full 10 s update cycle land.

- [ ] **Step 2: Watch for the worklet crash class.** A red box reading `[Worklets] Tried to synchronously call a Remote Function` on mount means an unmarked callee — jest cannot see it (constraint 5).

- [ ] **Step 3: Confirm the Skia text renders.** Bubble labels absent means a font regression (P1); a tofu box means an unchecked glyph (P1a) — check the codepoint against the bundled cmap, do not "fix" it by changing the size.

- [ ] **Step 4: Confirm the motion is real, not theatre.** With Task 1 landed, bubbles should breathe and bars should retween every 10 s. **If they are still static, Task 1 did not take** — most likely the array is mutated in place rather than replaced.

- [ ] **Step 5: Judge fidelity against the prototype** at `docs/design/mobile/v1/dev-handoff/prototype/`. Record any gap in `rn-open-items.md` rather than silently accepting it.

- [ ] **Step 6: Capture the golden, eyeball the PNG, then run the verify pass.** It must report `pass`. A golden that cannot reproduce itself is a flake — fix the scenario, never pin the flake. `:update` in a bad state will happily pin a screenshot of the Expo launcher as the baseline.

- [ ] **Step 7: Commit the golden and close 5c in `docs/STATUS.md`.**

---

## References

- Phase 5 design (decisions, per-module scope, constraints):
  [../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md](../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md)
- Skia font idiom (why `Skia.Font()` draws nothing on device):
  `packages/client-react-native/src/ui/shell/boot/scenes/bootSceneFonts.ts`
- Glyph substitution and the verified cmap set:
  `packages/client-react-native/src/ui/shell/boot/scenes/bootGlyphs.ts`
- Performance doctrine (what may and may not be animated):
  [../../performance.md](../../performance.md)
- Open items, incl. M6/M7 and the P1/P1a font findings:
  [../../rn-open-items.md](../../rn-open-items.md)
