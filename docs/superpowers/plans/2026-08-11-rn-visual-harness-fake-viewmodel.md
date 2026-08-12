# RN visual harness: fake ViewModel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the RN visual harness's live simulator composition with a static fake ViewModel, so golden captures are deterministic by construction rather than by remembering to pin each simulator.

**Architecture:** A new `tests/visual/buildFakeViewModel.ts` returns a `ViewModel` of fixed snapshots and no-op intents, mirroring `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`. `VisualScenarioHost` stops calling `createApp`/`createSimulatorPorts` and provides the fake instead. No `src/ui` component changes — they are already dumb.

**Tech Stack:** TypeScript, `@rtc/react-bindings` (`ViewModel`, `ViewModelProvider`), jest-expo + `@testing-library/react-native`, the existing `simctl` capture tier.

**Spec:** [../specs/2026-08-11-rn-visual-harness-fake-viewmodel-design.md](../specs/2026-08-11-rn-visual-harness-fake-viewmodel-design.md). Read it first — particularly the "what this trades away" section, which is deliberate and must not be quietly re-litigated during implementation.

## Global Constraints

- **Do not modify anything under `src/ui`.** The components are already correct: `src/ui` is grep-gated free of `rxjs`, `Date`, `localStorage`, `fetch`, `setTimeout`, `setInterval`. If a scenario seems to need a component change, stop and report — it means the fake is missing a hook, not that the component is wrong.
- **Do not delete `pricingPinMs` or `blotterSeedBaseMs`** (5 references across `client-core`/`domain`). They stay until every scenario has migrated; removal is a separate follow-up. Deleting them mid-migration breaks the scenarios still on sim ports.
- **The fake must contain no clock and no RNG.** No `Date.now()`, no `Math.random()`, no `interval`, no `setTimeout`, no `Observable` that emits more than once. This is the entire point; a single live source reintroduces the class.
- **`.tsx` test files run under JEST** (`jest.config.js` `testMatch: ["**/*.test.tsx"]`), `.ts` under **vitest**. A `.test.ts` under jest reports "No tests found" and exits 0 — a vacuous pass in both directions.
- **`pnpm lint:eslint` is NOT implied by `biome ci`** — this repo layers custom AST rules (`rtc/newspaper-order`, `rtc/name-functions-by-effect`, `arrow-body-style`, `padding-line-between-statements`) on top. A previous phase shipped 6 ESLint errors on that exact assumption. Also run `lint:eslint:types` — `no-floating-promises` is type-aware and the fast tier cannot see it.
- **`rtc/newspaper-order`:** exported declarations precede the helpers they call; **in test files, tests FIRST and helper functions AFTER** (fixture constants before tests is fine). The rule also moves `jest.mock` blocks.
- Braces on all control statements; explicit types on non-literal exports (`useExplicitType`).
- **No hand-rolled memoization** (ADR-003, React Compiler, gated by `pnpm check:compiler`).
- **Run after each task:** `pnpm --filter @rtc/client-react-native test`, `… typecheck`, `pnpm lint:eslint`, `pnpm exec biome ci .`

## Capture prerequisites (Tasks 6–7 only)

Golden capture needs a Mac, a booted simulator, an installed dev client and Metro. From `packages/client-react-native`:

```bash
EXPO_PUBLIC_VISUAL_HARNESS=1 EXPO_PUBLIC_SERVER_URL= EXPO_NO_TELEMETRY=1 CI=1 \
  npx expo start --dev-client --port 8083
```

Port **8083** is the runner's default. The runner now resolves the booted UDID itself (PR #525); `RTC_VISUAL_UDID` overrides it.

**Two traps, both already burned:**
1. A capture failure is **not** a visual regression. The tier refuses to screenshot a launcher, and now distinguishes "never read the a11y tree" (tooling) from "read it, still the launcher" (real). Never `--update` from a run you have not eyeballed.
2. **Two samples are not enough to call something deterministic.** `equities/markets` measured 0.00% on runs 1↔2 and **1.60%** on 1↔3. Always take three.

## Verified facts — do not re-derive

- The composition site is one function in `VisualScenarioHost.tsx` ending:
  ```ts
  const { presenters, commands } = createApp({
    ...createSimulatorPorts({ preferences, auth, sessionStore, blotterSeedBaseMs, pricingPinMs }),
    connectionEvents,
  });
  return createViewModel(presenters, createMachineFactories(presenters), commands);
  ```
- **36 hooks** are destructured from `useViewModel()` across `src/ui` + `app/` (of 67 exposed). That is the working set.
- **21 registered scenarios**, of which **9 are `boot/*`** plus `lock/hold` — these render through `BootSceneFixture` and need almost no ViewModel. Task 1 therefore unblocks ~10 of 21.
- The web reference is 594 lines: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`. **Read it before Task 1.**

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/visual/buildFakeViewModel.ts` | **new** — the static ViewModel: defaults + per-scenario overrides |
| `tests/visual/buildFakeViewModel.test.tsx` | **new** — jest; determinism + shape guards |
| `tests/visual/fakeData.ts` | **new** — the fixed domain fixtures the fake serves |
| `tests/visual/VisualScenarioHost.tsx` | modify (Task 6) — provide the fake, drop `createApp`/`createSimulatorPorts` |
| `tests/visual/scenarios.tsx` | modify (Tasks 2–5) — each scenario declares its ViewModel overrides |

---

### Task 1: Fake skeleton, defaults, and the determinism guard

**Files:**
- Create: `packages/client-react-native/tests/visual/fakeData.ts`
- Create: `packages/client-react-native/tests/visual/buildFakeViewModel.ts`
- Test: `packages/client-react-native/tests/visual/buildFakeViewModel.test.tsx`

**Interfaces:**
- Produces:
  - `interface FakeViewModelOverrides { readonly [K in keyof ViewModel]?: ViewModel[K] }`
  - `buildFakeViewModel(overrides?: FakeViewModelOverrides): ViewModel`

Read `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts` first — this is its RN sibling, and matching its shape is deliberate.

Cover the **scalar and empty-collection** hooks in this task; later tasks add module slices. At minimum: `useConnectionStatus`, `usePowerSaver`, `useThemePreference`, `useThemeSkinPreference`, `useAmbientStyle`, `useAnimatedBackground`, `useForceBootAnimation`, `useBootGate`, `useBootSequence`, `useAuth`, `useActivity`, `useReconnect`, and empty arrays for `useTrades`, `useRfqs`, `useInstruments`, `useCurrencyPairs`, `useWatchlist`, `useEquityOrders`, `useEquityPositions`, `useDealers`, `useNewTradeIds`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test } from "@jest/globals";

import { buildFakeViewModel } from "./buildFakeViewModel";

describe("buildFakeViewModel", () => {
  test("returns identical values across calls — the whole point of the fake", () => {
    const a = buildFakeViewModel();
    const b = buildFakeViewModel();

    expect(a.useConnectionStatus()).toEqual(b.useConnectionStatus());
    expect(a.useTrades()).toEqual(b.useTrades());
    expect(a.useCurrencyPairs()).toEqual(b.useCurrencyPairs());
  });

  test("returns the same value on repeated reads within one instance", () => {
    // A hook backed by a live stream would differ between reads; a snapshot
    // cannot. This is the assertion that fails if anyone reintroduces one.
    const vm = buildFakeViewModel();

    expect(vm.useTrades()).toEqual(vm.useTrades());
    expect(vm.usePowerSaver()).toEqual(vm.usePowerSaver());
  });

  test("intents are no-ops that do not throw — screenshots never press buttons", () => {
    const vm = buildFakeViewModel();

    expect(() => {
      vm.useReconnect().reconnect();
    }).not.toThrow();
  });

  test("an override replaces exactly one hook and leaves the rest at defaults", () => {
    const base = buildFakeViewModel();
    const overridden = buildFakeViewModel({
      useConnectionStatus: () => {
        return "disconnected";
      },
    } as never);

    expect(overridden.useConnectionStatus()).toBe("disconnected");
    expect(overridden.useTrades()).toEqual(base.useTrades());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/buildFakeViewModel.test.tsx`
Expected: FAIL — `Cannot find module './buildFakeViewModel'`.

- [ ] **Step 3: Implement `fakeData.ts` then `buildFakeViewModel.ts`**

`fakeData.ts` holds frozen domain fixtures (`FAKE_CURRENCY_PAIRS`, `FAKE_TRADES`, …) typed against `@rtc/domain`. Every literal is fully specified — no `as never`, no omitted required fields. An under-specified fixture that typechecks only via a cast is how a production boundary type gets narrowed to fit a test (a real defect from Phase 5b).

`buildFakeViewModel.ts` returns `{ ...defaults, ...overrides } as ViewModel`, where each default is a function returning a frozen constant.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Add the no-clock/no-RNG grep guard**

```tsx
test("contains no clock or RNG source — determinism must be structural", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("./buildFakeViewModel.ts", import.meta.url),
    "utf8",
  );

  expect(src).not.toMatch(/Date\.now|Math\.random|setInterval|setTimeout|interval\(/);
});
```

Assert it against `fakeData.ts` too. This is the guard that keeps the property after the humans who cared about it have moved on.

- [ ] **Step 6: Commit**

```bash
git commit -m "test(rn-visual): static fake ViewModel skeleton with defaults" -- packages/client-react-native/tests/visual/
```

---

### Task 2: Shell + blotter slices

**Files:**
- Modify: `tests/visual/buildFakeViewModel.ts`, `tests/visual/fakeData.ts`
- Test: `tests/visual/buildFakeViewModel.test.tsx`

Covers `shell/connection-banner`, `shell/appearance`, `shell/chrome`, `blotter/seeded`.

Hooks: `useTrades` (a seeded roster, not empty), `useNewTradeIds`, `useConnectionStatus` (the banner needs a non-connected state), the theme/ambient preference hooks the Appearance sheet writes through.

**Preference hooks are read/write.** The Appearance sheet calls setters. Each must return a stable object whose setter is a no-op — but the *read* value must be whatever the scenario pins, so `shell/appearance` can be captured in a specific skin×mode.

- [ ] **Step 1: Write the failing test** — assert `useTrades()` returns the seeded roster (length and first row's fields), and that `useThemeSkinPreference()`'s setter does not throw and does not change the read value.
- [ ] **Step 2: Run it, watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

---

### Task 3: Rates slice

**Files:** as Task 2. Covers `rates/grid`.

Hooks: `useCurrencyPairs`, `usePrice`, `useNotional`, `useTileExecution`, `useTicketSubmission`.

`usePrice(symbol)` is per-symbol — return a fixed snapshot keyed by symbol, mirroring the web fake's *"per-symbol static snapshot for screenshots"*. `useTileExecution` returns the idle arm of its union; the ceremony states are not captured by this scenario.

- [ ] **Step 1: Write the failing test** — `usePrice("EURUSD")` returns the same object across two calls, and a different symbol returns a different fixed snapshot.
- [ ] **Step 2–5:** as above.

---

### Task 4: Credit slice

**Files:** as Task 2. Covers `credit/rfq-tiles`, `credit/sell-side`.

Hooks: `useRfqs`, `useQuotesForRfq`, `useDealers`, `useRfqCountdown`, `useRfqSubmission`, `useCreditRfqFilterPreference`.

**`useRfqCountdown` is the trap.** A countdown is a clock by nature. It must return a **fixed remaining value** — the frame the golden pins — never a ticking one. The prototype filmstrip samples a countdown ring at several instants; that is a filmstrip concern, not this tier's.

- [ ] **Step 1: Write the failing test** — assert `useRfqCountdown(id)` returns an identical value on two successive calls and after an `await` tick.
- [ ] **Step 2–5:** as above.

---

### Task 5: Equities slice

**Files:** as Task 2. Covers `equities/markets`, `equities/trade`, `equities/blotter`.

Hooks: `useWatchlist`, `useEquityQuote`, `useCandles`, `useEqWatchlistSort`, `useDepth`, `useOrderTicket`, `useEquityOrders`, `useEquityPositions`.

This slice is why the plan exists — `useEquityQuote` and `useCandles` are the two the live simulator was walking.

`useCandles(symbol, timeframe?)` returns a **fixed** array. Include `volume` on every candle: `Candle.volume` is required, and omitting it forced a production signature to be narrowed once already.

`useOrderTicket` returns the `editing` arm; the ceremony arms are not captured here.

- [ ] **Step 1: Write the failing test** — `useCandles("AAPL")` returns an identical array across calls; every candle carries `volume`; `useEquityQuote("AAPL")` is a fixed snapshot.
- [ ] **Step 2–5:** as above.

---

### Task 6: Cut the host over, recapture every golden

**Files:**
- Modify: `packages/client-react-native/tests/visual/VisualScenarioHost.tsx`
- Modify: `packages/client-react-native/tests/visual/scenarios.tsx` (per-scenario overrides)

- [ ] **Step 1: Replace the composition**

Delete the `createApp` / `createSimulatorPorts` call and return `buildFakeViewModel(scenario.viewModel)` instead. Keep `ViewModelProvider`, the skin×mode pin, and the `powerSaverLevel` seed — **motion gating is already correct and must not change**.

Leave the imports of `pricingPinMs` / `blotterSeedBaseMs` deleted here but the domain parameters themselves untouched.

- [ ] **Step 2: Run the scenario matrix unit test**

Run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/scenarios.test.tsx`

- [ ] **Step 3: Run the full package suite + gates**

- [ ] **Step 4: Capture every scenario to scratch and EYEBALL each one**

```bash
pnpm test:rn:visual:simctl --scratch
```

Twenty-one PNGs. Look at all of them. A scenario that renders empty because the fake is missing a hook will look plausible in a list of filenames and obvious in the image. **Do not skip to `--update`.**

- [ ] **Step 5: Update the goldens and verify reproduction**

```bash
pnpm test:rn:visual:simctl:update
pnpm test:rn:visual:simctl
```

The verify pass must report `pass` for every scenario. A golden that cannot reproduce itself is flaky — fix the scenario, do not pin the flake.

- [ ] **Step 6: Commit**

---

### Task 7: Re-measure determinism, decide the tolerance, pin the last two goldens

**Files:**
- Modify: `packages/client-react-native/tests/visual/shared/diff.ts` (only if the measurement justifies it)
- Modify: `docs/rn-open-items.md` (close T46), `docs/STATUS.md`

- [ ] **Step 1: Three-sample sweep**

Capture all 21 scenarios to three separate scratch dirs and diff pairwise. **Three, not two** — two samples reported `equities/markets` as deterministic when it drifts 1.60%.

- [ ] **Step 2: Decide `DEFAULT_RATIO` from the measurement**

It is `0.06` (6%) today, sized for a live-simulator tier. If the sweep shows 0.00% across the board, propose a value that reflects it and **state the measured floor in the code comment beside the constant**. If any scenario is non-zero, do not lower the budget to hide it — report which scenario and why.

Do not set this number by assumption. The web tolerance audit exists because that was done once and was wrong in both directions at once.

- [ ] **Step 3: Pin `equities/markets` and `equities/trade`**

These were deliberately left unpinned pending this work. They are the acceptance test: if they now reproduce at 0.00% across three runs, the plan achieved its goal.

- [ ] **Step 4: Close T46 and record the outcome**

Update `docs/rn-open-items.md` — T46's remaining half is these two goldens. Adjust the roster counts at the top (`RN-specific (N)` / `Total N`); check the current values rather than assuming. Update the STATUS entry.

- [ ] **Step 5: Full gate + commit**

```bash
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/client-react-native typecheck
pnpm lint:eslint && pnpm lint:eslint:types
pnpm exec biome ci .
pnpm check:doc-links && pnpm check:compiler && pnpm check:worklet-order
```

---

## Done when

- `VisualScenarioHost` composes no ports and no simulators.
- All 21 goldens are captured against the fake and reproduce at the measured floor.
- `equities/markets` and `equities/trade` are pinned.
- A grep guard fails the build if a clock or RNG enters the fake.
- `DEFAULT_RATIO` reflects a measurement, with the number recorded beside it.

## Deliberately NOT in this plan

- **Deleting `pricingPinMs` / `blotterSeedBaseMs`.** Follow-up once nothing depends on them.
- **Any `src/ui` change.** The components are already dumb.
- **The Maestro tier.** Same harness, inherits the fix.
- **New scenarios** for `credit/new-rfq`, `rates/ticket`, `shell/dock-open` — prototype surfaces with no registered scenario. Separate backlog item.
