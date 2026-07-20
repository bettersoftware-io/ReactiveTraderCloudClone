# RN mobile-v1 Rehaul — Phase 4a (Rates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the React Native **Rates** module (`packages/client-react-native`) to mobile-v1 prototype fidelity — a 2-column spot-tile grid with event-driven tick-flash, `Layout`-transition filter glides, a `@gorhom/bottom-sheet` trade ticket, and a busy → scan → FILLED-stamp execution ceremony — while preserving the existing `useViewModel()` data seam.

**Architecture:** Presentation-only rebuild over a frozen data seam. All prices/execution flow through the existing `@rtc/react-bindings` hooks (`useCurrencyPairs`, `usePrice`, `useNotional`, `useTileExecution`) — unchanged. Motion runs as Reanimated 4 worklets on the UI thread; the tick-flash restart key comes from `@rtc/motion-core`'s `nextTickFlash`/`tickDirection` (RN is the first real consumer); filter reordering uses Reanimated's native `LinearTransition`/`entering`/`exiting` (the platform-idiomatic FLIP, not the web's manual `flipDeltas`). All motion is gated by the Phase-3 `useShellMotionEnabled()` (reduced-motion ∧ ¬Freeze).

**Tech Stack:** Expo SDK 57 / RN 0.86, `react-native-reanimated@4.5.0`, `react-native-worklets@0.10.0`, `@gorhom/bottom-sheet` (new), `react-native-gesture-handler@~2.32`, `expo-blur`, `expo-haptics`, `react-native-svg`, `@rtc/motion-core`. Tests: `.test.ts` → vitest (pure fns), `.test.tsx` → jest-expo (components/hooks; reanimated + gesture-handler globally mocked).

## Global Constraints

Every task's requirements implicitly include this section. Copy exact values verbatim.

- **Dumb-UI doctrine:** no `rxjs` / `localStorage` / `fetch` in `src/ui`. Data flows **only** through `useViewModel()` hooks. Type-only imports from `@rtc/domain` / `@rtc/client-core` are allowed; value imports from `@rtc/motion-core` are allowed. Never reach into `@rtc/domain`/`@rtc/client-core` for behavior.
- **Data seam is frozen:** do not change `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or the wire protocol. Consume the existing hook signatures verbatim (see Interfaces per task).
- **Perf doctrine** (`docs/performance.md`, RN-adapted): animate **only `transform`/`opacity`**; run animations as Reanimated worklets on the UI thread; use `Layout` transitions for list moves (never animate layout props directly); **calm until a real event** — no timer-driven idle motion. Tick-flash / ceremony fire off the real price/execution streams.
- **Motion gating:** every animation is gated by `useShellMotionEnabled()` from `#/ui/shell/hud/useShellMotionEnabled` (returns `!reducedMotion && !isFreeze`). When gated off, render the **static end-state** and cancel any running worklet — never leave a half-played animation.
- **Imports:** use the `#/` subpath alias (maps to `src/`), e.g. `#/ui/rates/SpotTile`. Biome bans ≥2-up relative imports (`../../`). No `@/`.
- **Braces on all control statements** (Biome `style/useBlockStatements`) — brace-less `if`/`for` fails CI.
- **Component/module rules:** Biome `useComponentExportOnlyModules` — a file exporting a component must not also export non-component values at top level (nest test probes inside helpers; see `useShellMotionEnabled.test.tsx` for the pattern). ESLint `rtc/newspaper-order`, `rtc/component-newspaper`, `rtc/class-filename-match` apply. New root `*.ts` must join `tsconfig.eslint.json` include (N/A here — all files are inside the package).
- **Type-aware ESLint:** `no-floating-promises` is a CI-only gate (`eslint.config.typed.mjs`). Any promise (incl. `fireEvent.press` returns in tests, `haptics` calls) must be `await`ed or explicitly `void`ed. Run BOTH eslint configs per file before declaring done.
- **All gates cover the package:** `pnpm --filter @rtc/client-react-native typecheck`, `biome ci`, both eslint configs, `knip`, and `jest` must be green. New native/JS deps require a **jest mock** so the suite stays green.
- **Dep freshness policy:** adding `@gorhom/bottom-sheet` follows the policy — `pnpm outdated -r`, choose the latest version whose release is ≥24h old (minimumReleaseAge cooldown), single range via syncpack. Peer-compat verified: gorhom needs `react-native-gesture-handler >=2.16.1` (have ~2.32.0 ✓) and `react-native-reanimated >=3.16.0 || >=4.0.0-` (have 4.5.0 ✓). It is **pure-JS** (no native module) → **no dev-client rebuild required**.
- **CI:** NEVER add `test:rn:visual:*` scripts to `.github/workflows/ci.yml` (macOS-only, no runners). The RN visual harness is gated on `__DEV__ && EXPO_PUBLIC_VISUAL_HARNESS === "1"`.
- **Platform:** iOS-first, Android-safe. Sign-off on the iOS simulator. No iOS-only API without an Android fallback.

## Prototype reference (source of truth)

`docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader Mobile.dc.html`. Rates markup L97–129; ticket sheet L484–550; keyframes L32–48. Default theme `holo`/`dark`. Numeric quick-reference (all values below are prototype-exact):

| Element | Value |
|---|---|
| Tile grid | 2 columns, `gap 9px`, container `padding 10px 12px 8px`; tile `border-radius 12px`, `padding 10px 11px 9px` |
| Tile enter | `kfTileIn` fade + `scale(0.92)→1`, 300ms ease, backwards |
| Big price | **the ASK**, split prefix/pips/frac (`splitPrice`); pips `25px`/600, colored by direction; prefix `14px` muted; frac `12px` muted |
| Direction arrow | `▲`/`▼`/`▬`, `11px`, color = direction; color settles over 450ms |
| Tick-flash | pips scale `1.22 → 1`, **240ms**, `cubic-bezier(0.2,0.9,0.3,1)` |
| Row 3 | mono `9px`, `B {bid}` · spread chip (bg `chip`, `padding 2px 6px`, radius 5) · `A {ask}` |
| Filter pills | `['ALL','EUR','USD','GBP','JPY','AUD']`; mono `10px`/600, `padding 6px 13px`, radius 999; selected bg `accentPrimary`/text `textOnAccent` |
| FLIP glide | stayers 320ms `cubic-bezier(0.25,0.9,0.3,1)`; enterers fade+rise `translateY(9px)→0` 300ms/60ms delay; leavers fade 220ms |
| Ticket sheet | slide-up `kfSheetUp` 420ms `cubic-bezier(0.22,1,0.36,1)`, `panel` bg + blur, `border-radius 18px 18px 0 0`, grabber 38×4 |
| Notional | steppers halve/double, **min 250000**; chips `1M,2M,5M,10M,20M`; value mono `22px`/600 `toLocaleString('en-US')` |
| Buy/Sell pads | SELL left (shows **bid**), BUY right (shows **ask**); pips `27px`/700; centered spread pill; **no confirm button** — tap = execute |
| Ceremony busy | spinner ring `kfSpin 0.8s`; scan bar `kfScan 1.1s`; label `EXECUTING {DIR}` |
| Ceremony settle | prototype uses 1250–1750ms; **RN uses the real `TileExecutionState` transitions** (`started`→`tooLong`→`finished`/`timeout`), not a timer |
| Ceremony stamp | `FILLED`/`REJECTED`, `26px`/700, `letter-spacing 5px`, `kfStamp` spring `scale(1.7) rotate(-7deg)→scale(1) rotate(0)` 500ms `cubic-bezier(0.2,1.4,0.4,1)` |
| Auto-close | ticket closes when execution returns to `ready` after a terminal state (existing behavior) |

## Data seam (verbatim — do not change)

```ts
// @rtc/react-bindings useViewModel()
useCurrencyPairs: () => readonly CurrencyPair[];
usePrice: (pair: CurrencyPair) => Price | null;
useTileExecution: (pair: CurrencyPair) => { state: TileExecutionState } & TileExecutionIntents;
useNotional: (defaultNotional: number) => { state: NotionalView } & NotionalIntents;

// @rtc/domain
interface CurrencyPair { symbol: string; ratePrecision: number; pipsPosition: number; base: string; terms: string; defaultNotional: number; baseMid: number; typicalSpreadPips: number; }
enum PriceMovementType { NONE = "NONE", UP = "UP", DOWN = "DOWN" }
interface Price extends PriceTick { movementType: PriceMovementType; spread: string; /* bid,ask,mid: number */ }
enum Direction { Buy = "Buy", Sell = "Sell" }
enum ExecutionStatus { Done = "Done", Rejected = "Rejected", Timeout = "Timeout", CreditExceeded = "CreditExceeded" }

// @rtc/client-core
type TileExecutionState =
  | { status: "ready" }
  | { status: "started" }
  | { status: "tooLong" }
  | { status: "finished"; executionStatus: ExecutionStatus; trade?: Trade }
  | { status: "timeout" };
interface TileExecutionIntents { execute: (direction: Direction, price: Price, notional: number) => void; dismiss: () => void; }
interface NotionalView { displayValue: string; numericValue: number; error: string | null; }
interface NotionalIntents { change: (input: string) => void; reset: () => void; }

// @rtc/motion-core
type TickDirection = "up" | "down" | "flat";
interface TickFlashState { value: number | null; nonce: number }
function nextTickFlash(state: TickFlashState, next: number): { dir: TickDirection; state: TickFlashState };
function tickDirection(prev: number | null | undefined, next: number): TickDirection;
```

## File Structure

New module directory `packages/client-react-native/src/ui/rates/`. All new files live here (plus a jest mock and the route rewire). The old flat `src/ui/{TileGrid,SpotTile,TradeTicket}.tsx` are deleted in Task 11. Existing shared utils `src/ui/formatPrice.ts` (`splitPrice`) and `src/ui/fxColumns.ts` (`fxColumnCount`) stay put and are imported.

```
packages/client-react-native/
  __mocks__/@gorhom/bottom-sheet.tsx        (T1) jest manual mock
  src/ui/rates/
    ratesFilter.ts                          (T2) RATE_FILTERS + filterPairs  [pure]
    RateFilterBar.tsx                        (T3) pill row
    useTickFlash.ts                          (T4) Reanimated pips-pop hook
    SpotTile.tsx                             (T5) rebuilt tile
    SpotTileGrid.tsx                         (T6) animated 2-col grid
    RatesModule.tsx                          (T6/T11) screen root: filter + grid + ticket host
    ticket/
      NotionalControl.tsx                    (T7) steppers + chips
      BuySellPads.tsx                        (T8) bid/ask execute pads
      ExecutionCeremony.tsx                  (T9) busy + stamp overlays
      TradeTicketSheet.tsx                   (T10) gorhom BottomSheetModal assembly
  app/(app)/index.tsx                        (T6) render <RatesModule/>
```

---

### Task 1: Add `@gorhom/bottom-sheet` + jest mock

**Files:**
- Modify: `packages/client-react-native/package.json` (dependencies)
- Modify: `pnpm-lock.yaml` (via install), syncpack range
- Create: `packages/client-react-native/__mocks__/@gorhom/bottom-sheet.tsx`

**Interfaces:**
- Produces: the `@gorhom/bottom-sheet` package resolvable at runtime; a jest mock exporting `BottomSheetModal`, `BottomSheetModalProvider`, `BottomSheetView`, `BottomSheetBackdrop`, and `useBottomSheetModal` so `.test.tsx` files can mount the ticket without the native/portal machinery.

- [ ] **Step 1: Freshness check + add the dep**

Run `pnpm outdated -r` and `npm view @gorhom/bottom-sheet time --json` to confirm the latest version is ≥24h old. Add it to `packages/client-react-native/package.json` dependencies at the chosen version (as of writing, `5.2.14`; use the latest that satisfies the 24h cooldown), then:

```bash
pnpm install
pnpm dlx syncpack list-mismatches   # expect no new mismatch; fix range if flagged
```

- [ ] **Step 2: Write the jest mock**

`@gorhom/bottom-sheet` uses `@gorhom/portal` + reanimated internally; mock it to plain views so component tests can assert content.

```tsx
// packages/client-react-native/__mocks__/@gorhom/bottom-sheet.tsx
import type { ReactNode, Ref } from "react";
import { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

interface SheetProps {
  children?: ReactNode;
}

/** Test double: renders children inline (always "open") and exposes a no-op
 * imperative present/dismiss/close so tiles can call ref.present(). */
export const BottomSheetModal = forwardRef(function BottomSheetModal(
  props: SheetProps,
  ref: Ref<{ present: () => void; dismiss: () => void; close: () => void }>,
) {
  useImperativeHandle(ref, () => {
    return { present: () => {}, dismiss: () => {}, close: () => {} };
  });
  return <View testID="bottom-sheet">{props.children}</View>;
});

export function BottomSheetModalProvider(props: SheetProps): React.JSX.Element {
  return <View>{props.children}</View>;
}

export function BottomSheetView(props: SheetProps): React.JSX.Element {
  return <View>{props.children}</View>;
}

export function BottomSheetBackdrop(): null {
  return null;
}

export function useBottomSheetModal(): { dismiss: () => void; dismissAll: () => void } {
  return { dismiss: () => {}, dismissAll: () => {} };
}
```

- [ ] **Step 3: Verify the suite is still green**

Run: `pnpm --filter @rtc/client-react-native test`
Expected: PASS (unchanged count — the mock isn't consumed yet, but confirms it resolves and the install didn't break anything).

- [ ] **Step 4: Verify gauntlet**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native knip`
Expected: PASS. (`knip` may flag the new dep as unused until Task 10 consumes it — if so, add it to the package's `knip` `ignoreDependencies` **temporarily with a `TODO(phase-4a)` comment**, and REMOVE that entry in Task 11 once `TradeTicketSheet` imports it. Note this in the commit body.)

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/package.json pnpm-lock.yaml packages/client-react-native/__mocks__
git commit -m "build(rn): add @gorhom/bottom-sheet + jest mock for the trade ticket"
```

---

### Task 2: Rates filter — pure fn

**Files:**
- Create: `packages/client-react-native/src/ui/rates/ratesFilter.ts`
- Test: `packages/client-react-native/src/ui/rates/ratesFilter.test.ts` (vitest — `.test.ts`)

**Interfaces:**
- Consumes: `CurrencyPair` (type) from `@rtc/domain`.
- Produces: `RATE_FILTERS: readonly RateFilter[]`, `type RateFilter`, `filterPairs(pairs, filter): readonly CurrencyPair[]`.

- [ ] **Step 1: Write the failing test**

```ts
// ratesFilter.test.ts
import { describe, expect, it } from "vitest";

import type { CurrencyPair } from "@rtc/domain";

import { filterPairs, RATE_FILTERS } from "./ratesFilter";

function pair(symbol: string): CurrencyPair {
  return { symbol, ratePrecision: 5, pipsPosition: 4, base: symbol.slice(0, 3), terms: symbol.slice(3), defaultNotional: 1_000_000, baseMid: 1, typicalSpreadPips: 1 };
}

const pairs = [pair("EURUSD"), pair("USDJPY"), pair("GBPUSD"), pair("EURJPY")];

describe("filterPairs", () => {
  it("returns all pairs for ALL", () => {
    expect(filterPairs(pairs, "ALL")).toHaveLength(4);
  });

  it("matches the substring anywhere in the symbol", () => {
    expect(filterPairs(pairs, "JPY").map((p) => p.symbol)).toEqual(["USDJPY", "EURJPY"]);
    expect(filterPairs(pairs, "EUR").map((p) => p.symbol)).toEqual(["EURUSD", "EURJPY"]);
  });

  it("exposes the prototype filter set in order", () => {
    expect(RATE_FILTERS).toEqual(["ALL", "EUR", "USD", "GBP", "JPY", "AUD"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/rates/ratesFilter.test.ts`
Expected: FAIL ("Cannot find module './ratesFilter'").

- [ ] **Step 3: Write minimal implementation**

```ts
// ratesFilter.ts
import type { CurrencyPair } from "@rtc/domain";

export const RATE_FILTERS = ["ALL", "EUR", "USD", "GBP", "JPY", "AUD"] as const;

export type RateFilter = (typeof RATE_FILTERS)[number];

/** Prototype filter: ALL passes through; otherwise keep pairs whose symbol
 * contains the currency substring (`dc.html` L2452: `p.sym.includes(filter)`). */
export function filterPairs(
  pairs: readonly CurrencyPair[],
  filter: RateFilter,
): readonly CurrencyPair[] {
  if (filter === "ALL") {
    return pairs;
  }

  return pairs.filter((p) => {
    return p.symbol.includes(filter);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/rates/ratesFilter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/ratesFilter.ts packages/client-react-native/src/ui/rates/ratesFilter.test.ts
git commit -m "feat(rn-rates): pure currency-pair filter (ALL/EUR/USD/GBP/JPY/AUD)"
```

---

### Task 3: Filter bar component

**Files:**
- Create: `packages/client-react-native/src/ui/rates/RateFilterBar.tsx`
- Test: `packages/client-react-native/src/ui/rates/RateFilterBar.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `RATE_FILTERS`, `RateFilter` from `./ratesFilter`; `useTheme()` from `#/ui/theme/useTheme`.
- Produces: `RateFilterBar({ selected, onSelect }: { selected: RateFilter; onSelect: (f: RateFilter) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// RateFilterBar.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { RateFilterBar } from "./RateFilterBar";

test("renders every prototype filter and reports selection", async () => {
  const onSelect = jest.fn();
  renderWithTheme(<RateFilterBar selected="ALL" onSelect={onSelect} />);

  expect(screen.getByText("ALL")).toBeTruthy();
  expect(screen.getByText("JPY")).toBeTruthy();

  await fireEvent.press(screen.getByText("EUR"));
  expect(onSelect).toHaveBeenCalledWith("EUR");
});
```

> `renderWithTheme` is the existing helper at `src/ui/theme/renderWithTheme.tsx` (wraps in `ThemeProvider`). Confirm its export name/signature and match it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native test RateFilterBar`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Horizontal scrolling pill row. Use `useTheme()` for colors; selected pill uses `accentPrimary` bg + `textOnAccent`, unselected transparent + `textSecondary` + `border`. Prototype: mono 10px/600, `padding 6px 13px`, radius 999, `gap 7px`, container `padding 10px 12px 2px`, `overflow-x:auto` → RN `ScrollView horizontal`.

```tsx
import type { JSX } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { useTheme } from "#/ui/theme/useTheme";

import { RATE_FILTERS, type RateFilter } from "./ratesFilter";

interface RateFilterBarProps {
  selected: RateFilter;
  onSelect: (filter: RateFilter) => void;
}

export function RateFilterBar({ selected, onSelect }: RateFilterBarProps): JSX.Element {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="rate-filter-bar"
    >
      {RATE_FILTERS.map((filter) => {
        const active = filter === selected;
        return (
          <Pressable
            key={filter}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              onSelect(filter);
            }}
            style={[
              styles.pill,
              {
                backgroundColor: active ? theme.accentPrimary : "transparent",
                borderColor: active ? theme.accentPrimary : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? theme.textOnAccent : theme.textSecondary, fontFamily: theme.fontMono },
              ]}
            >
              {filter}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 7, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  pill: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: "600", letterSpacing: 1 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native test RateFilterBar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/RateFilterBar.*
git commit -m "feat(rn-rates): prototype filter pill bar"
```

---

### Task 4: Tick-flash Reanimated hook

**Files:**
- Create: `packages/client-react-native/src/ui/rates/useTickFlash.ts`
- Test: `packages/client-react-native/src/ui/rates/useTickFlash.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `nextTickFlash`, `TickFlashState` from `@rtc/motion-core`; reanimated `useSharedValue`/`useAnimatedStyle`/`withSequence`/`withTiming`/`cancelAnimation`/`Easing`.
- Produces: `useTickFlash(value: number, enabled: boolean): { flashStyle: ReturnType<typeof useAnimatedStyle> }` — an animated transform style that pops the pips `scale 1 → 1.22 → 1` (240ms) on every non-flat tick (keyed by the motion-core nonce so a repeated same-direction tick still replays). When `enabled` is false, scale is pinned at 1.

- [ ] **Step 1: Write the failing test**

Because jest globally mocks reanimated (`withSequence`/`withTiming` are identity/no-op), the test asserts the hook mounts, returns a style, and re-runs across value changes without throwing — the *keying* correctness (`nextTickFlash` nonce) is already unit-tested in `@rtc/motion-core`.

```tsx
// useTickFlash.test.tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { useTickFlash } from "./useTickFlash";

function Probe({ value, enabled }: { value: number; enabled: boolean }): React.JSX.Element {
  const { flashStyle } = useTickFlash(value, enabled);
  return (
    <View style={flashStyle}>
      <Text>flash</Text>
    </View>
  );
}

test("mounts and survives value changes and gating", () => {
  const { rerender } = render(<Probe value={1.085} enabled />);
  expect(screen.getByText("flash")).toBeTruthy();
  rerender(<Probe value={1.086} enabled />);
  rerender(<Probe value={1.086} enabled={false} />);
  expect(screen.getByText("flash")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native test useTickFlash`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import { useEffect, useRef } from "react";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type AnimatedStyle,
} from "react-native-reanimated";

import { nextTickFlash, type TickFlashState } from "@rtc/motion-core";

/** Prototype pips-pop: `scale 1.22 → 1` over 240ms, `cubic-bezier(0.2,0.9,0.3,1)`
 * (`dc.html` L856-859). Split into two 120ms halves. */
const POP_SCALE = 1.22;
const POP_HALF_MS = 120;
const POP_EASING = Easing.bezier(0.2, 0.9, 0.3, 1);

export function useTickFlash(
  value: number,
  enabled: boolean,
): { flashStyle: AnimatedStyle } {
  const scale = useSharedValue(1);
  const stateRef = useRef<TickFlashState>({ value: null, nonce: 0 });
  const nonceRef = useRef(0);

  useEffect(() => {
    const result = nextTickFlash(stateRef.current, value);
    stateRef.current = result.state;
    if (result.state.nonce === nonceRef.current) {
      return;
    }

    nonceRef.current = result.state.nonce;
    if (enabled) {
      scale.value = withSequence(
        withTiming(POP_SCALE, { duration: POP_HALF_MS, easing: POP_EASING }),
        withTiming(1, { duration: POP_HALF_MS, easing: POP_EASING }),
      );
    }
  }, [value, enabled, scale]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(scale);
      scale.value = 1;
    }
  }, [enabled, scale]);

  return {
    flashStyle: useAnimatedStyle(() => {
      return { transform: [{ scale: scale.value }] };
    }),
  };
}
```

> If `AnimatedStyle` is not exported by the installed reanimated version, type the return as `ReturnType<typeof useAnimatedStyle>` instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native test useTickFlash`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/useTickFlash.*
git commit -m "feat(rn-rates): tick-flash pips-pop hook keyed by motion-core nextTickFlash"
```

---

### Task 5: SpotTile rebuild

**Files:**
- Create: `packages/client-react-native/src/ui/rates/SpotTile.tsx`
- Test: `packages/client-react-native/src/ui/rates/SpotTile.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `usePrice` (via `useViewModel()`), `splitPrice` from `#/ui/formatPrice`, `useTickFlash` (T4), `useShellMotionEnabled` from `#/ui/shell/hud/useShellMotionEnabled`, `PriceMovementType` from `@rtc/domain`, `useTheme`.
- Produces: `SpotTile({ pair, onOpenTicket }: { pair: CurrencyPair; onOpenTicket: (pair: CurrencyPair) => void })`. Tapping the tile calls `onOpenTicket(pair)` (the ticket is hosted once at the module level — Task 6/11 — not per tile).

- [ ] **Step 1: Write the failing test**

Mock `useViewModel` (like `useShellMotionEnabled.test.tsx`) to feed a fixed `Price`. Assert: pair label, the ASK pips digits, bid/ask row, movement color, and that tapping fires `onOpenTicket`.

```tsx
// SpotTile.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockUsePrice = jest.fn();
const mockMotion = jest.fn<() => boolean>(() => true);

jest.mock("@rtc/react-bindings", () => {
  return { useViewModel: () => ({ usePrice: mockUsePrice }) };
});
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return { useShellMotionEnabled: () => mockMotion() };
});

const { SpotTile } = require("./SpotTile") as typeof import("./SpotTile");

const pair = { symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4, base: "EUR", terms: "USD", defaultNotional: 1_000_000, baseMid: 1.08, typicalSpreadPips: 1 };

test("renders the ask pips and opens the ticket on tap", async () => {
  mockUsePrice.mockReturnValue({ symbol: "EURUSD", bid: 1.08716, ask: 1.0873, mid: 1.08723, spread: "1.4", movementType: PriceMovementType.UP, valueDate: "", creationTimestamp: 0 });
  const onOpen = jest.fn();
  renderWithTheme(<SpotTile pair={pair} onOpenTicket={onOpen} />);

  expect(screen.getByText("EUR/USD")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-pips-EURUSD")).toBeTruthy();   // ask big digits

  await fireEvent.press(screen.getByTestId("spot-tile-EURUSD"));
  expect(onOpen).toHaveBeenCalledWith(pair);
});

test("shows a loading state before the first price", () => {
  mockUsePrice.mockReturnValue(null);
  renderWithTheme(<SpotTile pair={pair} onOpenTicket={jest.fn()} />);
  expect(screen.getByText(/Loading/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native test rates/SpotTile`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Layout per prototype: header row (`{base}/{terms}` + arrow), divider, big price row (`Animated.Text` for pips carrying `flashStyle`), bid/spread/ask row. Big price = `splitPrice(price.ask, ratePrecision, pipsPosition)`. Direction color: UP→`accentPositive`, DOWN→`accentNegative`, NONE→`textSecondary`. Pips wrapped in `Animated.Text` with `useTickFlash(price.mid, motionEnabled).flashStyle`. Tile is a `Pressable` firing `onOpenTicket(pair)`. Tile-entry `entering={FadeIn}` may be added in the grid (Task 6), not here. `testID`s: `spot-tile-{symbol}`, `spot-tile-pips-{symbol}`.

Reference the existing (about-to-be-deleted) `src/ui/SpotTile.tsx` for the `ARROW` map, `splitPrice` usage, and the themed-style idiom; port those, restyled to the prototype table above. Keep all colors from `useTheme()` — no hardcoded hex.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native test rates/SpotTile`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/SpotTile.*
git commit -m "feat(rn-rates): rebuild spot tile to prototype layout with tick-flash pips"
```

---

### Task 6: Animated grid + module root + route rewire

**Files:**
- Create: `packages/client-react-native/src/ui/rates/SpotTileGrid.tsx`
- Create: `packages/client-react-native/src/ui/rates/RatesModule.tsx`
- Modify: `packages/client-react-native/app/(app)/index.tsx`
- Test: `packages/client-react-native/src/ui/rates/RatesModule.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `useCurrencyPairs` (via `useViewModel()`), `filterPairs`/`RateFilter` (T2), `RateFilterBar` (T3), `SpotTile` (T5), `useShellMotionEnabled`, reanimated `Animated`/`LinearTransition`/`FadeIn`/`FadeOut`, `fxColumnCount` from `#/ui/fxColumns`.
- Produces: `RatesModule()` (default-exported screen body: filter state + grid; in Task 11 it also hosts the ticket). `SpotTileGrid({ pairs, columns, onOpenTicket })`.

> **Filter glide = native `Layout` transition, NOT motion-core `flipDeltas`.** Reanimated computes the FLIP internally. Each grid cell gets `layout={LinearTransition.duration(320)}`, `entering={FadeIn.duration(300).delay(60)}`, `exiting={FadeOut.duration(220)}` — matching the prototype timings — and all three are stripped when `useShellMotionEnabled()` is false (pass `undefined`).

- [ ] **Step 1: Write the failing test**

```tsx
// RatesModule.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockPairs = jest.fn();
jest.mock("@rtc/react-bindings", () => {
  return { useViewModel: () => ({ useCurrencyPairs: mockPairs, usePrice: () => null }) };
});
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return { useShellMotionEnabled: () => false };   // static in tests — no reanimated layout
});

const { default: RatesModule } = require("./RatesModule") as { default: React.ComponentType };

function pair(symbol: string) {
  return { symbol, ratePrecision: 5, pipsPosition: 4, base: symbol.slice(0, 3), terms: symbol.slice(3), defaultNotional: 1_000_000, baseMid: 1, typicalSpreadPips: 1 };
}

test("renders tiles and filters them", async () => {
  mockPairs.mockReturnValue([pair("EURUSD"), pair("USDJPY"), pair("EURJPY")]);
  renderWithTheme(<RatesModule />);

  expect(screen.getByTestId("spot-tile-EURUSD")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-USDJPY")).toBeTruthy();

  await fireEvent.press(screen.getByText("JPY"));
  expect(screen.queryByTestId("spot-tile-EURUSD")).toBeNull();
  expect(screen.getByTestId("spot-tile-USDJPY")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-EURJPY")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native test RatesModule`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `SpotTileGrid` + `RatesModule`**

`SpotTileGrid`: renders `pairs` into a 2-column layout (compute columns via `fxColumnCount(width)` using `useWindowDimensions`, default 2). Each cell is an `Animated.View` with the `layout`/`entering`/`exiting` props described above (gated). `RatesModule`: `useState<RateFilter>("ALL")`, `const pairs = useCurrencyPairs()`, `const shown = filterPairs(pairs, filter)`, renders `<RateFilterBar>` + `<SpotTileGrid pairs={shown} onOpenTicket={...}>`. For this task `onOpenTicket` is a `useState<CurrencyPair | null>` setter stub (the sheet is wired in Task 11); keep the state now so Task 11 is a small diff.

- [ ] **Step 4: Rewire the route**

```tsx
// app/(app)/index.tsx
import type { JSX } from "react";

import RatesModule from "#/ui/rates/RatesModule";

/** The Rates module — the live FX spot-tile grid + trade ticket. */
export default function RatesScreen(): JSX.Element {
  return <RatesModule />;
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter @rtc/client-react-native test RatesModule && pnpm --filter @rtc/client-react-native typecheck`
Expected: PASS. (The old `TileGrid.tsx` still exists and is now unimported — `knip` will flag it; it is deleted in Task 11. Note this in the commit body so the reviewer expects it.)

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/rates/SpotTileGrid.tsx packages/client-react-native/src/ui/rates/RatesModule.tsx "packages/client-react-native/app/(app)/index.tsx" packages/client-react-native/src/ui/rates/RatesModule.test.tsx
git commit -m "feat(rn-rates): animated 2-col grid + filter glide; route renders RatesModule"
```

---

### Task 7: Notional control

**Files:**
- Create: `packages/client-react-native/src/ui/rates/ticket/NotionalControl.tsx`
- Test: `packages/client-react-native/src/ui/rates/ticket/NotionalControl.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `useNotional` (via `useViewModel()`) — `{ state: NotionalView } & NotionalIntents`; `useTheme`.
- Produces: `NotionalControl({ notional, base }: { notional: { state: NotionalView } & NotionalIntents; base: string })`. The parent (ticket) owns the `useNotional(defaultNotional)` call and passes it down, so the notional survives ticket open/close and is shared with the Buy/Sell pads.

**Behavior (prototype L497-511, 2567-2568):** big value `state.displayValue` (already formatted by the machine) mono 22px/600; `−`/`+` steppers halve/double the numeric value with a **250000 floor** (call `notional.change(String(next))`); quick chips `1M,2M,5M,10M,20M` set the value; active chip highlighted when it equals the current numeric value.

- [ ] **Step 1: Write the failing test**

```tsx
// NotionalControl.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { NotionalControl } from "./NotionalControl";

function makeNotional(numericValue: number) {
  return { state: { displayValue: numericValue.toLocaleString("en-US"), numericValue, error: null }, change: jest.fn(), reset: jest.fn() };
}

test("steppers halve/double with a 250k floor", async () => {
  const n = makeNotional(1_000_000);
  renderWithTheme(<NotionalControl notional={n} base="EUR" />);

  await fireEvent.press(screen.getByTestId("notional-up"));
  expect(n.change).toHaveBeenCalledWith("2000000");

  n.change.mockClear();
  await fireEvent.press(screen.getByTestId("notional-down"));
  expect(n.change).toHaveBeenCalledWith("500000");
});

test("does not go below the 250k floor", async () => {
  const n = makeNotional(250_000);
  renderWithTheme(<NotionalControl notional={n} base="EUR" />);
  await fireEvent.press(screen.getByTestId("notional-down"));
  expect(n.change).toHaveBeenCalledWith("250000");
});

test("quick chip sets the notional", async () => {
  const n = makeNotional(1_000_000);
  renderWithTheme(<NotionalControl notional={n} base="EUR" />);
  await fireEvent.press(screen.getByText("5M"));
  expect(n.change).toHaveBeenCalledWith("5000000");
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @rtc/client-react-native test NotionalControl` → FAIL.

- [ ] **Step 3: Implement.** Pure helpers inline: `const NOTIONAL_FLOOR = 250_000;` `const CHIPS = [1, 2, 5, 10, 20].map((m) => m * 1_000_000);` `stepDown = Math.max(NOTIONAL_FLOOR, numericValue / 2)`, `stepUp = numericValue * 2`. Steppers 34×30 (`testID` `notional-down`/`notional-up`), value `Text` mono 22px, label `NOTIONAL · {base}`. Chips row: label `{m}M`, active when `value === numericValue`.

- [ ] **Step 4: Run test to verify it passes** — Expected PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/ticket/NotionalControl.*
git commit -m "feat(rn-rates): notional stepper + quick-chip control (250k floor)"
```

---

### Task 8: Buy/Sell execute pads

**Files:**
- Create: `packages/client-react-native/src/ui/rates/ticket/BuySellPads.tsx`
- Test: `packages/client-react-native/src/ui/rates/ticket/BuySellPads.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `splitPrice` from `#/ui/formatPrice`; `Direction` from `@rtc/domain`; `Price`, `CurrencyPair` (types); `useTheme`.
- Produces: `BuySellPads({ pair, price, onExecute }: { pair: CurrencyPair; price: Price; onExecute: (direction: Direction) => void })`. SELL pad (left, shows **bid**) → `onExecute(Direction.Sell)`; BUY pad (right, shows **ask**) → `onExecute(Direction.Buy)`; centered spread pill shows `price.spread`. No confirm button.

- [ ] **Step 1: Write the failing test**

```tsx
// BuySellPads.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Direction, PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { BuySellPads } from "./BuySellPads";

const pair = { symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4, base: "EUR", terms: "USD", defaultNotional: 1_000_000, baseMid: 1.08, typicalSpreadPips: 1 };
const price = { symbol: "EURUSD", bid: 1.08716, ask: 1.0873, mid: 1.08723, spread: "1.4", movementType: PriceMovementType.UP, valueDate: "", creationTimestamp: 0 };

test("SELL uses bid → Sell, BUY uses ask → Buy", async () => {
  const onExecute = jest.fn();
  renderWithTheme(<BuySellPads pair={pair} price={price} onExecute={onExecute} />);

  await fireEvent.press(screen.getByTestId("sell-pad"));
  expect(onExecute).toHaveBeenCalledWith(Direction.Sell);

  await fireEvent.press(screen.getByTestId("buy-pad"));
  expect(onExecute).toHaveBeenCalledWith(Direction.Buy);

  expect(screen.getByText("1.4")).toBeTruthy();   // spread pill
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @rtc/client-react-native test BuySellPads` → FAIL.

- [ ] **Step 3: Implement.** Two `Pressable` pads side by side. SELL: `splitPrice(price.bid, …)`, label `SELL`, `accentNegative` treatment (`testID="sell-pad"`). BUY: `splitPrice(price.ask, …)`, label `BUY`, `accentPositive` (`testID="buy-pad"`). Pips 27px/700. Centered absolute spread pill (`price.spread`, `bgHeader`/`border`, mono 9px). Active/press → glow via `theme.glowC` shadow (skip if `null`).

- [ ] **Step 4: Run test to verify it passes** — Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/ticket/BuySellPads.*
git commit -m "feat(rn-rates): buy/sell execute pads (bid=Sell, ask=Buy)"
```

---

### Task 9: Execution ceremony overlays

**Files:**
- Create: `packages/client-react-native/src/ui/rates/ticket/ExecutionCeremony.tsx`
- Test: `packages/client-react-native/src/ui/rates/ticket/ExecutionCeremony.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `TileExecutionState` (type) from `@rtc/client-core`; `ExecutionStatus`, `Direction` from `@rtc/domain`; `useShellMotionEnabled`; `expo-haptics` (`notificationAsync`); reanimated for the stamp spring; `useTheme`.
- Produces: `ExecutionCeremony({ state, direction }: { state: TileExecutionState; direction: Direction | null })`. Maps the real execution state to overlays: `ready` → renders nothing; `started`/`tooLong` → busy overlay (spinner + scan bar + `EXECUTING {DIR}`); `finished` → stamp (`FILLED` if `executionStatus === Done`, else `REJECTED`) + detail; `timeout` → `TIMED OUT` stamp. Fire an `expo-haptics` notification once when entering a terminal state (Success for Done, Error otherwise).

> **Drive off the real `TileExecutionState`, not a timer.** The prototype's 1250–1750ms settle is simulated latency; the RN client already has the real machine (`started → tooLong → finished|timeout`). Do not add `setTimeout`.

- [ ] **Step 1: Write the failing test**

```tsx
// ExecutionCeremony.test.tsx
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { Direction, ExecutionStatus } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

jest.mock("expo-haptics", () => {
  return { notificationAsync: jest.fn(), NotificationFeedbackType: { Success: "s", Error: "e" } };
});
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return { useShellMotionEnabled: () => true };
});

const { ExecutionCeremony } = require("./ExecutionCeremony") as typeof import("./ExecutionCeremony");

test("ready renders nothing", () => {
  const { toJSON } = renderWithTheme(<ExecutionCeremony state={{ status: "ready" }} direction={null} />);
  expect(toJSON()).toBeNull();
});

test("started shows the busy overlay", () => {
  renderWithTheme(<ExecutionCeremony state={{ status: "started" }} direction={Direction.Buy} />);
  expect(screen.getByText(/EXECUTING/)).toBeTruthy();
});

test("finished+Done shows FILLED", () => {
  renderWithTheme(<ExecutionCeremony state={{ status: "finished", executionStatus: ExecutionStatus.Done }} direction={Direction.Buy} />);
  expect(screen.getByText("FILLED")).toBeTruthy();
});

test("finished+Rejected shows REJECTED", () => {
  renderWithTheme(<ExecutionCeremony state={{ status: "finished", executionStatus: ExecutionStatus.Rejected }} direction={Direction.Sell} />);
  expect(screen.getByText("REJECTED")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @rtc/client-react-native test ExecutionCeremony` → FAIL.

- [ ] **Step 3: Implement.** Switch on `state.status`. Busy overlay: an `Animated.View` spinner (continuous rotation, gated), a scan bar (`translateX` loop, gated), and `EXECUTING {direction}`. Stamp: `Animated.Text` with a `withSpring`-driven `scale`+`rotate` entrance (gated → static), text `FILLED`/`REJECTED`/`TIMED OUT`, color `accentPositive`/`accentNegative`. Haptic: a `useEffect` keyed on a terminal `state.status` calls `void Haptics.notificationAsync(...)` **once** (guard with a ref so re-renders don't re-fire). When motion is gated, render the overlays statically (no spinner/scan/spring) but keep the text — reduced-motion users still see EXECUTING/FILLED.

- [ ] **Step 4: Run test to verify it passes** — Expected PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/ticket/ExecutionCeremony.*
git commit -m "feat(rn-rates): execution ceremony (busy/scan + FILLED/REJECTED stamp) off real state"
```

---

### Task 10: Trade ticket bottom sheet (gorhom assembly)

**Files:**
- Create: `packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.tsx`
- Test: `packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.test.tsx` (jest-expo)

**Interfaces:**
- Consumes: `@gorhom/bottom-sheet` (`BottomSheetModal`, `BottomSheetView`, `BottomSheetBackdrop`); `usePrice`, `useNotional`, `useTileExecution` (via `useViewModel()`); `NotionalControl` (T7), `BuySellPads` (T8), `ExecutionCeremony` (T9); `Direction` from `@rtc/domain`; `useTheme`.
- Produces: `TradeTicketSheet({ pair, onClose }: { pair: CurrencyPair; onClose: () => void })` — rendered only when a pair is selected (Task 11 mounts it). Presents the sheet on mount; assembles grabber (via sheet `handle`), header (`{base}/{terms}` + `SPOT · T+2`), `NotionalControl`, `BuySellPads`, and `ExecutionCeremony` overlay. Buy/Sell → `execution.execute(direction, price, notional.state.numericValue)`. Auto-closes (`onClose`) when the execution machine returns to `ready` **after** a terminal state — port the existing effect from the old `TradeTicket.tsx` (L42-49).

- [ ] **Step 1: Write the failing test**

Rely on the Task-1 mock (sheet renders inline). Assert it shows the header + pads and that tapping BUY calls `execute` with the current notional and `Direction.Buy`.

```tsx
// TradeTicketSheet.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Direction, PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const execute = jest.fn();
const price = { symbol: "EURUSD", bid: 1.08716, ask: 1.0873, mid: 1.08723, spread: "1.4", movementType: PriceMovementType.UP, valueDate: "", creationTimestamp: 0 };

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => ({
      usePrice: () => price,
      useNotional: () => ({ state: { displayValue: "1,000,000", numericValue: 1_000_000, error: null }, change: jest.fn(), reset: jest.fn() }),
      useTileExecution: () => ({ state: { status: "ready" }, execute, dismiss: jest.fn() }),
    }),
  };
});
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => ({ useShellMotionEnabled: () => false }));

const { TradeTicketSheet } = require("./TradeTicketSheet") as typeof import("./TradeTicketSheet");
const pair = { symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4, base: "EUR", terms: "USD", defaultNotional: 1_000_000, baseMid: 1.08, typicalSpreadPips: 1 };

test("executes a buy at the current notional", async () => {
  renderWithTheme(<TradeTicketSheet pair={pair} onClose={jest.fn()} />);
  expect(screen.getByText("EUR/USD")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("buy-pad"));
  expect(execute).toHaveBeenCalledWith(Direction.Buy, price, 1_000_000);
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @rtc/client-react-native test TradeTicketSheet` → FAIL.

- [ ] **Step 3: Implement.** `const price = usePrice(pair); const notional = useNotional(pair.defaultNotional); const execution = useTileExecution(pair);`. `useRef<BottomSheetModalMethods>` + `useEffect(() => ref.current?.present(), [])`. On dismiss (`onDismiss` prop) call `onClose()`. `handleExecute = (d: Direction) => { if (price) { execution.execute(d, price, notional.state.numericValue); } }`. Compose: header, `<NotionalControl notional={notional} base={pair.base}/>`, `<BuySellPads pair={pair} price={price} onExecute={handleExecute}/>` (guard on `price`), `<ExecutionCeremony state={execution.state} direction={lastDir}/>` where `lastDir` is a ref set in `handleExecute`. Auto-close effect: when `execution.state.status === "ready"` and the previous status was terminal, `ref.current?.dismiss()`.

- [ ] **Step 4: Run test to verify it passes** — Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.*
git commit -m "feat(rn-rates): trade ticket bottom sheet (gorhom) wiring notional/pads/ceremony"
```

---

### Task 11: Integrate ticket into the module + delete old files + green gauntlet

**Files:**
- Modify: `packages/client-react-native/src/ui/rates/RatesModule.tsx`
- Delete: `packages/client-react-native/src/ui/TileGrid.tsx`, `src/ui/SpotTile.tsx`, `src/ui/TradeTicket.tsx` (+ their `.test.tsx` if any)
- Modify: `packages/client-react-native/package.json` (remove the Task-1 temporary `knip.ignoreDependencies` entry, if one was added)

**Interfaces:**
- Consumes: `TradeTicketSheet` (T10), `BottomSheetModalProvider` from `@gorhom/bottom-sheet`.
- Produces: the fully wired Rates screen — selecting a tile presents the ticket; dismissing clears the selection.

- [ ] **Step 1: Wire the ticket host.** In `RatesModule`, wrap the body in `<BottomSheetModalProvider>` and render `{selectedPair ? <TradeTicketSheet pair={selectedPair} onClose={() => setSelectedPair(null)} /> : null}`. `onOpenTicket = setSelectedPair`.

> **Known scrim scope (flag for on-device):** the provider sits inside the shell `<Slot/>` body, so the sheet overlays the module area. Confirm on-device (Task 12) whether the scrim should also dim the Phase-3 radial dock; if so, lifting `BottomSheetModalProvider` to the shell root is a small follow-up (out of scope here).

- [ ] **Step 2: Delete the superseded flat files.**

```bash
git rm packages/client-react-native/src/ui/TileGrid.tsx packages/client-react-native/src/ui/SpotTile.tsx packages/client-react-native/src/ui/TradeTicket.tsx
# also git rm any TileGrid.test.tsx / SpotTile.test.tsx / TradeTicket.test.tsx that referenced them
```

Grep for stale imports: `grep -rn "ui/TileGrid\|ui/SpotTile\b\|ui/TradeTicket" packages/client-react-native/{src,app}` → expect zero hits.

- [ ] **Step 3: Remove the temporary knip ignore** (from Task 1 Step 4) if present, since `@gorhom/bottom-sheet` is now imported by `TradeTicketSheet`.

- [ ] **Step 4: Full package gauntlet.**

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/client-react-native knip
pnpm exec biome ci packages/client-react-native
pnpm exec eslint packages/client-react-native --config eslint.config.mjs
pnpm exec eslint packages/client-react-native --config eslint.config.typed.mjs
```

Expected: all PASS. Fix any `no-floating-promises` (await/void), `useBlockStatements`, `newspaper-order`, or `knip` findings before committing.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client-react-native
git commit -m "feat(rn-rates): host trade ticket in RatesModule; remove legacy flat Rates UI"
```

---

### Task 12: On-device validation + pin the Rates visual golden (the gate)

> This task requires the **iOS simulator + user go/no-go** — it does not run in CI. It mirrors Phase 3's Task 9. Automated tests supplement, never replace, this gate (master spec §6).

**Files:**
- Modify: RN visual harness scenario registry (add a `rates` scenario) + pin the golden under the RN goldens tree (follow `reference_visual_scenario_add_recipe_and_gotchas` and Phase 1/3's harness).

- [ ] **Step 1: Rebuild the dev-client if needed.** `@gorhom/bottom-sheet` is pure-JS → no prebuild needed. If Metro was running, restart it. If the app was already installed, a JS reload suffices. (Only rebuild the native dev-client if a red-box indicates otherwise — see `reference_rn_redbox_worklets_babel_stale_node_modules`; run `pnpm build` first if a catch-up merge pulled new lib source.)

- [ ] **Step 2: On-device checklist (drive via idb — `reference_rn_on_device_sim_automation`).**
  - Rates grid renders 2 columns; tiles show pair/arrow/big-ask/bid-spread-ask.
  - Live tick-flash: pips pop + color settle on real price updates.
  - Filter pills (ALL/EUR/USD/GBP/JPY/AUD) filter + glide (stayers slide, enterers rise, leavers fade).
  - Tap a tile → ticket sheet slides up (grabber, drag-to-dismiss works).
  - Notional steppers/chips update the value; 250k floor holds.
  - Tap BUY/SELL → busy overlay (spinner + scan) → FILLED/REJECTED stamp → haptic → auto-close; the booked trade appears in the Blotter.
  - Reduced-motion (OS) and power-saver **Freeze**: no pops/glides/spring; static end-states; content still correct.
  - Sheet scrim vs the radial dock (see Task 11 note) — decide keep/lift.
  - Bottom safe-area: sheet + pads clear the home indicator.

- [ ] **Step 3: Pin the `rates` visual golden** — add a `rates`/seeded-price scenario to the RN harness with a frozen price feed for determinism (mirror the Phase 3 `shell` scenario and Phase 1 `blotter/seeded`). Capture on the pinned device (`ios-iphone17-26`). Commit the golden PNG(s).

- [ ] **Step 4: Commit**

```bash
git add packages/client-react-native
git commit -m "test(rn-rates): pin Rates visual golden + on-device sign-off"
```

---

## Self-Review

- **Spec coverage:** master spec §5 Phase 4 "Rates" line-items — tick-flashing spot tiles (T4/T5) ✓; FLIP filter glides via Layout (T6) ✓; trade-ticket bottom sheet (T7/T8/T10) ✓; execution ceremony scan→FILLED (T9) ✓; re-wired to the existing pricing/execution ViewModel (T5/T10, seam unchanged) ✓; module baseline pinned + on-device sign-off (T12) ✓. Blotter is deliberately **out of scope** (Phase 4b).
- **Cross-cutting constraints:** dumb-UI (hooks-only) ✓; transform/opacity-only + worklets ✓; Layout for list moves ✓; reduced-motion/Freeze gating via `useShellMotionEnabled` (T4/T5/T6/T9) ✓; new dep jest-mocked + freshness (T1) ✓; iOS-first (T12) ✓.
- **Type consistency:** `execute(direction, price, notional)` signature used identically in T8/T10; `TileExecutionState` union handled exhaustively in T9; `NotionalView.numericValue` used for the floor math (T7) and the execute call (T10).
- **No placeholders:** each code step carries complete logic; styling steps cite the prototype value table. Where a style idiom is deferred, it points at a concrete existing pattern file (`useShellMotionEnabled.test.tsx`, the old `SpotTile.tsx`).
