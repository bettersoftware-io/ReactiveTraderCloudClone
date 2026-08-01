# RN mobile-v1 Rehaul — Phase 5a (Credit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the React Native **Credit** module (`packages/client-react-native`) to mobile-v1 prototype fidelity — countdown rings, streaming dealer quotes with a pulsing best-quote ACCEPT, an accept ceremony, a new-RFQ cascade, a reshaped New-RFQ form, and a sell-side panel that wears the prototype's visual language over the *real* multi-RFQ list — all over the unchanged `useViewModel()` data seam.

**Architecture:** Presentation-only rebuild, exactly like Phases 4a/4b. Data flows through the existing `useRfqs()` / `useQuotesForRfq()` / `useRfqCountdown()` / `useInstruments()` / `useDealers()` / `useRfqSubmission()` / `useTicketSubmission()` hooks — unchanged. Ring geometry comes from `@rtc/motion-core`'s already-`"worklet"`-marked `ringCircumference` / `ringDashOffset`; card entrance/exit uses Reanimated's native `LinearTransition` / `FadeInDown` / `FadeOut` (the 4b idiom). All motion gated by `useShellMotionEnabled()`.

**Tech Stack:** Expo SDK 57 / RN 0.86, `react-native-reanimated@4.5.0`, `react-native-svg`, `@shopify/react-native-skia` (not needed here — Credit has no chart), `expo-haptics`, `@rtc/domain` types. **No new dependencies.** Tests: `.test.ts` → vitest (pure fns), `.test.tsx` → jest-expo (components; reanimated globally mocked).

## Global Constraints

Every task's requirements implicitly include this section.

- **Dumb-UI doctrine:** no `rxjs` / `localStorage` / `fetch` / timers in `src/ui`. Data **only** through `useViewModel()` hooks. Type-only imports from `@rtc/domain` allowed.
- **Data seam is frozen:** no changes to `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or the wire protocol (Phase 5 design §4).
- **⚠️ NEVER write `setTimeout`, `setInterval`, `localStorage`, `fetch`, or `rxjs` as a literal token anywhere in `src/ui` — INCLUDING COMMENTS.** The `@rtc/tests` gates are plain greps over the tree and match prose. Phase 4a reddened CI on a doc comment reading ``no `setTimeout` here``. Say "UI-side timers" instead. **The accept-linger (Task 5) is exactly the shape of thing that tempts one — it may not use one.**
- **Run `pnpm --filter @rtc/tests gates` before pushing.** ~1s, a CI gate, and a per-package gauntlet does **not** run it.
- **Worklet rule (this repo has been bitten three times — #334, #340, and the five blank boot scenes fixed in #439):** any function reached from inside a Reanimated worklet must itself carry `"worklet"`, transitively, **and must be declared above its caller in the same file** — a worklet captures every module-level binding *by value at module evaluation*, constants exactly as much as functions, so a later declaration arrives as `undefined` on the UI thread. `pnpm check:worklet-order` gates both halves and is in CI. jest is structurally blind to the whole class; the simulator is the only witness.
- **Perf doctrine** (`docs/performance.md`): animate **only `transform`/`opacity`** on RN views, plus the prototype-mandated colour transitions via animated style. SVG **stroke/`strokeDashoffset` are not RN layout properties** and are legal to animate — do not confuse the two rules.
- **Motion gating:** every animation gated by `useShellMotionEnabled()` from `#/ui/shell/hud/useShellMotionEnabled`. When off, render the static end-state and start no loops.
- **Styling** through **`useThemedStyles(makeStyles)`** (`#/ui/theme/useThemedStyles`) — NOT a bare `makeStyles(theme)` per render. RFQ cards re-render on every quote tick and there is no React Compiler in the RN package. All colours from theme tokens — **no hardcoded hex**.
- **Horizontal chip rows** MUST set `style={{ flexGrow: 0, flexShrink: 0 }}` and `contentContainerStyle` `alignItems: "center"`. Without both they stretch into full-height bars on short content (the Phase 4a bug). This phase adds *four* new chip rows — do not reintroduce it.
- **Imports:** `#/` alias (maps to `src/`). No ≥2-up relative imports. No `@/`.
- **Exports:** named exports only outside `app/**`.
- **Braces on all control statements.** `rtc/component-newspaper` (exported component first, `*Props` + consts after), `useComponentExportOnlyModules`, `rtc/no-render-functions`, `rtc/name-functions-by-effect` (a handler is named for its **effect**; `onX` is only for function-typed *props*).
- **Type-aware ESLint is a CI gate:** `await` every RNTL `render` / `fireEvent.press`. Run BOTH `eslint .` and `eslint . --config eslint.config.typed.mjs`.
- **Animated styles:** an `AnimatedStyle<ViewStyle>` cannot be applied to `Animated.Text` — wrap in an `Animated.View`.
- **Visual-harness rule (learned 2026-08-01, PR #443):** any new scenario that mounts *screen content* must be wrapped in `ScreenContentFixture`, or the status bar and dynamic island cover its first rows and the golden pins that as correct. Full-bleed surfaces are the exception. See `tests/visual/README.md`.
- **Platform:** iOS-first, Android-safe.

## Prototype reference (source of truth)

All values read from `docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader Mobile.dc.html` at the cited lines. Do not estimate — these are measured.

| Element | Value | Line |
|---|---|---|
| RFQ card | `border-radius: 12px`, `1px` border, `padding: 10px 12px 6px`, `margin-bottom: 9px`, `kfTileIn 0.35s ease backwards` | 222 |
| `kfTileIn` | `from { opacity: 0; transform: scale(0.92) }` | 36 |
| Countdown ring | 32×32 box, `flex: none`; track `circle cx=16 cy=16 r=13 stroke-width=2.5`; progress same geometry + `stroke-linecap: round`, `stroke-dasharray: 81.7` | 229–232 |
| Ring transition | **`stroke-dashoffset 1s linear, stroke 0.4s`** | 232 |
| ACCEPT button | `font-size: 8.5px`, `700`, `letter-spacing: 1.5px`, `padding: 7px 11px`, `border-radius: 7px` | 246 |
| `kfPulse` | `0%,100% { box-shadow: 0 0 0 0 var(--pulse-c) }`, `55% { box-shadow: 0 0 0 9px transparent }` | 38 |
| AWAITING | `font-size: 8px`, `letter-spacing: 1px`, `--faint`; the `…` animates `kfConnPulse 1.1s infinite` | 249 |
| `kfConnPulse` | `0%,100% { opacity: 1 }`, `50% { opacity: 0.35 }` | 47 |
| `kfStamp` | `0% scale(1.7) rotate(-7deg) opacity 0`; `55% scale(0.96) rotate(1deg) opacity 1`; `100% scale(1) rotate(0)` | 37 |
| Filter chips | **`LIVE` / `DONE` / `ALL`** — three, not five | 2121 |
| Accept linger | prototype comment: *"freshly-accepted cards linger in LIVE so the ACCEPTED stamp reads before they leave"* | 2127–2129 |
| BROADCAST RFQ | `font-size: 11px`, `700`, `letter-spacing: 3px`, `padding: 14px 0`, `border-radius: 11px`, acc→acc2 gradient, active `scale(0.98)` | 284 |
| Sell-side card | `border-radius: 12px`, `padding: 12px 13px`, `margin-bottom: 10px` | 292 |
| `◈ INCOMING RFQ` | `font-size: 8.5px`, `letter-spacing: 2px`, `--aware` | 294 |
| Sell-side timer | a 2px **bar**, not a ring: `transition: width 1s linear, background 0.4s` | 297 |
| Price stepper | 44×44 buttons, `border-radius: 9px`, `1px` border, `--acc`, `font-size: 16px`; price `24px/700` mono centred; `gap: 9px` | 300–302 |
| Sell-side submit | `font-size: 10.5px`, `700`, `letter-spacing: 2.5px`, `padding: 13px 0`, `border-radius: 10px` | 303 |
| `YOUR QUOTES` rows | `border-radius: 9px`, `padding: 8px 11px`, `margin-bottom: 7px`, `kfTileIn 0.3s`; status pill `8px`, `ls 1px`, `padding: 2px 6px`, `border-radius: 4px` | 306–312 |

**`81.7` is not a magic number:** it is 2π×13 = 81.68, i.e. exactly `ringCircumference(13)` from `@rtc/motion-core`. Use the function, never the literal.

## Locked decisions inherited from the design spec

Do not re-litigate these; they are settled in `docs/superpowers/specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md` §3.1.

- **Sell-side takes the prototype's visual language over the real list structure.** The prototype models one rotating incoming ticket plus a client-local WON/LOST history; the seam models many simultaneously-open RFQs. Build the prototype's chrome — stepper, countdown, card, status pills — around **each real open ticket in a list**.
- **The prototype's "resolves WON/LOST after 2600 ms" is dropped.** Won/lost derives from real `QuoteState` (`accepted` → won, `rejectedWithPrice` → lost). More correct, and needs no timer.
- **The 5-way RN filter becomes the 3-way shared seam** (Task 8). Prototype and domain are both 3-way; `useCreditRfqFilterPreference()` already exists and is unused on RN.

## File structure

| File | Responsibility |
|---|---|
| `src/ui/credit/rfqTiles/RfqCountdownRing.tsx` | **replaces** `RfqCountdownBar.tsx` — 32×32 SVG ring, animated dash offset + colour flip |
| `src/ui/credit/rfqTiles/rfqRingVm.ts` | pure: remaining-ms → `{ dashOffset, isUrgent }`; no React |
| `src/ui/credit/rfqTiles/bestQuote.ts` | pure: `findBestQuoteId(rfq, quotes)`, ported from the web's `rfqCardVm.ts:120` |
| `src/ui/credit/rfqTiles/AcceptPulse.tsx` | looping scale+opacity ripple overlay behind the ACCEPT button |
| `src/ui/credit/rfqTiles/AwaitingLabel.tsx` | `AWAITING…` with the pulsing ellipsis |
| `src/ui/credit/rfqTiles/RfqCard.tsx` | modified — ring, best-quote tint, ceremony, prototype chrome |
| `src/ui/credit/rfqTiles/RfqTilesPanel.tsx` | modified — cascade (`LinearTransition`/`FadeInDown`/`FadeOut`) |
| `src/ui/credit/rfqTiles/RfqFilterTabs.tsx` | modified — 3-way, shared preference seam |
| `src/ui/credit/newRfq/InstrumentChipGrid.tsx` | **replaces** `InstrumentSearch.tsx` |
| `src/ui/credit/newRfq/QuantityChips.tsx` | **replaces** `QuantityInput.tsx` free-text |
| `src/ui/credit/newRfq/NewRfqForm.tsx` | modified — chips, no dealer list |
| `src/ui/credit/newRfq/DealerSelection.tsx` | **deleted** (seam defaults to all dealers) |
| `src/ui/credit/sellSide/PriceStepper.tsx` | 44×44 ±0.05 stepper |
| `src/ui/credit/sellSide/SellSideTicket.tsx` | **replaces** `TradeTicket.tsx` — one real open RFQ, prototype chrome |
| `src/ui/credit/sellSide/SellSidePanel.tsx` | modified — list of real open tickets |

---

## Task 1: Ring view-model (pure)

**Files:**
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/rfqRingVm.ts`
- Test: `packages/client-react-native/src/ui/credit/rfqTiles/rfqRingVm.test.ts`

**Interfaces:**
- Consumes: `ringCircumference`, `ringDashOffset` from `@rtc/motion-core`.
- Produces: `rfqRingVm(remainingMs: number, totalMs: number): RfqRingVm` where `interface RfqRingVm { readonly dashOffset: number; readonly isUrgent: boolean }`; `RFQ_RING_RADIUS = 13`, `RFQ_RING_URGENT_MS = 10_000`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { ringCircumference } from "@rtc/motion-core";

import { RFQ_RING_RADIUS, rfqRingVm } from "#/ui/credit/rfqTiles/rfqRingVm";

describe("rfqRingVm", () => {
  it("is a full ring at full remaining time", () => {
    expect(rfqRingVm(60_000, 60_000).dashOffset).toBeCloseTo(0, 5);
  });

  it("is an empty ring at zero remaining", () => {
    expect(rfqRingVm(0, 60_000).dashOffset).toBeCloseTo(
      ringCircumference(RFQ_RING_RADIUS),
      5,
    );
  });

  it("flips to urgent under ten seconds", () => {
    expect(rfqRingVm(10_001, 60_000).isUrgent).toBe(false);
    expect(rfqRingVm(9_999, 60_000).isUrgent).toBe(true);
  });

  it("clamps a negative remaining to empty rather than overshooting", () => {
    expect(rfqRingVm(-5_000, 60_000).dashOffset).toBeCloseTo(
      ringCircumference(RFQ_RING_RADIUS),
      5,
    );
  });

  it("treats a zero total as expired instead of dividing by zero", () => {
    expect(Number.isFinite(rfqRingVm(0, 0).dashOffset)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/credit/rfqTiles/rfqRingVm.test.ts`
Expected: FAIL — cannot resolve `#/ui/credit/rfqTiles/rfqRingVm`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { ringCircumference, ringDashOffset } from "@rtc/motion-core";

/** Ring radius, from the prototype's `circle r="13"` (dc.html:231). Its
 * `stroke-dasharray: 81.7` is 2π×13 — i.e. `ringCircumference(13)`, which is
 * why that literal never appears in our code. */
export const RFQ_RING_RADIUS = 13;

/** The prototype flips the ring to the negative accent under ten seconds. */
export const RFQ_RING_URGENT_MS = 10_000;

export interface RfqRingVm {
  readonly dashOffset: number;
  readonly isUrgent: boolean;
}

export function rfqRingVm(remainingMs: number, totalMs: number): RfqRingVm {
  const safeTotal = totalMs > 0 ? totalMs : 1;
  const clamped = Math.max(0, Math.min(remainingMs, safeTotal));

  return {
    dashOffset: ringDashOffset(clamped / safeTotal, RFQ_RING_RADIUS),
    isUrgent: clamped < RFQ_RING_URGENT_MS,
  };
}
```

If `ringDashOffset`'s signature differs, adapt the call — do **not** re-implement the geometry here; the whole point is one source of truth with the lock ring.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/credit/rfqTiles/rfqRingVm.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/credit/rfqTiles/rfqRingVm.ts packages/client-react-native/src/ui/credit/rfqTiles/rfqRingVm.test.ts
git commit -m "feat(rn-credit): pure countdown-ring view-model over motion-core geometry"
```

---

## Task 2: Countdown ring component

**Files:**
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownRing.tsx`
- Test: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownRing.test.tsx`
- Delete: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownBar.tsx` (+ its test) **in Task 3**, once `RfqCard` no longer imports it.

**Interfaces:**
- Consumes: `rfqRingVm`, `RFQ_RING_RADIUS` (Task 1); `useShellMotionEnabled()`.
- Produces: `<RfqCountdownRing remainingMs={number} totalMs={number} />`, testID `rfq-countdown-ring`.

**Why the `withTiming` bridge exists — read before implementing.** `useRfqCountdown()` delivers a plain JS number every 100 ms. Binding it straight to `strokeDashoffset` would render ten visible steps a second. The prototype gets its smooth sweep from CSS `transition: stroke-dashoffset 1s linear` (dc.html:232); the RN equivalent is `withTiming(target, { duration: 1000, easing: Easing.linear })`, which keeps the ring gliding on the UI thread between JS updates. The colour flip mirrors the same declaration's `stroke 0.4s`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "vitest";

import { renderWithTheme } from "#/testing/renderWithTheme";
import { RfqCountdownRing } from "#/ui/credit/rfqTiles/RfqCountdownRing";

describe("RfqCountdownRing", () => {
  it("renders a ring for a live RFQ", async () => {
    await renderWithTheme(<RfqCountdownRing remainingMs={30_000} totalMs={60_000} />);
    expect(screen.getByTestId("rfq-countdown-ring")).toBeTruthy();
  });

  it("still renders at zero remaining rather than unmounting", async () => {
    await renderWithTheme(<RfqCountdownRing remainingMs={0} totalMs={60_000} />);
    expect(screen.getByTestId("rfq-countdown-ring")).toBeTruthy();
  });
});
```

Use whatever the package's existing themed-render helper is called — copy the import from `RfqCountdownBar.test.tsx` rather than guessing. `render`/`screen` above are placeholders for that same helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles/RfqCountdownRing.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { ringCircumference } from "@rtc/motion-core";

import { RFQ_RING_RADIUS, rfqRingVm } from "#/ui/credit/rfqTiles/rfqRingVm";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function RfqCountdownRing({
  remainingMs,
  totalMs,
}: RfqCountdownRingProps): JSX.Element {
  const theme = useTheme();
  const motion = useShellMotionEnabled();
  const vm = rfqRingVm(remainingMs, totalMs);

  // The ring glides for a full second between the seam's 100 ms updates —
  // see the component header. With motion off, snap to the end-state.
  const offset = useDerivedValue(() => {
    return motion
      ? withTiming(vm.dashOffset, { duration: RING_GLIDE_MS, easing: Easing.linear })
      : vm.dashOffset;
  });
  const urgency = useDerivedValue(() => {
    const target = vm.isUrgent ? 1 : 0;
    return motion ? withTiming(target, { duration: RING_TINT_MS }) : target;
  });

  const animatedProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: offset.value,
      stroke: interpolateColor(
        urgency.value,
        [0, 1],
        [theme.accentPrimary, theme.accentNegative],
      ),
    };
  });

  return (
    <View testID="rfq-countdown-ring" style={styles.root}>
      <Svg width={RING_BOX} height={RING_BOX}>
        <Circle
          cx={RING_CENTRE}
          cy={RING_CENTRE}
          r={RFQ_RING_RADIUS}
          fill="none"
          stroke={theme.borderSubtle}
          strokeWidth={RING_STROKE}
        />
        <AnimatedCircle
          cx={RING_CENTRE}
          cy={RING_CENTRE}
          r={RFQ_RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={ringCircumference(RFQ_RING_RADIUS)}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}

export interface RfqCountdownRingProps {
  readonly remainingMs: number;
  readonly totalMs: number;
}

/** Prototype dc.html:229-232 — a 32×32 box, `r=13`, `stroke-width 2.5`. */
const RING_BOX = 32;
const RING_CENTRE = 16;
const RING_STROKE = 2.5;
/** `transition: stroke-dashoffset 1s linear, stroke 0.4s` (dc.html:232). */
const RING_GLIDE_MS = 1000;
const RING_TINT_MS = 400;

/** Plain `StyleSheet.create`, NOT `useThemedStyles`: this component's only
 * styled node is a fixed 32×32 box with no theme-derived value, and a
 * `makeStyles(t)` taking an unused `t` is a lint error. Its colours come from
 * `useTheme()` above, where they belong — they are SVG props, not styles. */
const styles = StyleSheet.create({
  root: { width: RING_BOX, height: RING_BOX, flexGrow: 0, flexShrink: 0 },
});
```

Token names (`accentPrimary`, `accentNegative`, `borderSubtle`) must be checked against `#/ui/theme/tokens` — use the real ones.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles/RfqCountdownRing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Check the worklet gate**

Run: `pnpm check:worklet-order`
Expected: `clean`. `interpolateColor` is Reanimated's own and is worklet-safe; `rfqRingVm` is called in React-land, **not** inside the animated props — keep it that way.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownRing.tsx packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownRing.test.tsx
git commit -m "feat(rn-credit): 32x32 countdown ring with a 1s linear glide bridge"
```

---

## Task 3: Best-quote selection (pure) + card adoption of the ring

**Files:**
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/bestQuote.ts`
- Test: `packages/client-react-native/src/ui/credit/rfqTiles/bestQuote.test.ts`
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCard.tsx`
- Delete: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownBar.tsx` and `RfqCountdownBar.test.tsx`

**Interfaces:**
- Consumes: `RfqCountdownRing` (Task 2).
- Produces: `findBestQuoteId(rfq: Rfq, quotes: readonly Quote[]): number | null`.

**Port, do not re-derive.** The web's `packages/client-react/src/ui/credit/rfqs/rfqCardVm.ts:120` already implements this and is pure. Read it and port it verbatim; "best" is **min price for Buy, max for Sell**, among *priced pending* quotes only.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { type Quote, type Rfq } from "@rtc/domain";

import { findBestQuoteId } from "#/ui/credit/rfqTiles/bestQuote";

function pending(id: number, price: number | null): Quote {
  return { id, rfqId: 1, state: { type: "pending", price } } as unknown as Quote;
}

describe("findBestQuoteId", () => {
  it("picks the LOWEST price for a Buy", () => {
    expect(findBestQuoteId(buyRfq, [pending(10, 99), pending(11, 97)])).toBe(11);
  });

  it("picks the HIGHEST price for a Sell", () => {
    expect(findBestQuoteId(sellRfq, [pending(10, 99), pending(11, 97)])).toBe(10);
  });

  it("ignores quotes with no price", () => {
    expect(findBestQuoteId(buyRfq, [pending(10, null), pending(11, 97)])).toBe(11);
  });

  it("ignores quotes that are no longer pending", () => {
    const accepted = { id: 12, rfqId: 1, state: { type: "accepted", price: 1 } } as unknown as Quote;

    expect(findBestQuoteId(buyRfq, [accepted, pending(11, 97)])).toBe(11);
  });

  it("returns null when nothing is priced", () => {
    expect(findBestQuoteId(buyRfq, [pending(10, null)])).toBeNull();
  });
});
```

**The `as unknown as Quote` helper is a deliberate, bounded shortcut** — `Quote` carries more fields than these five assertions need, and spelling every one out would bury the cases. Declare `buyRfq`/`sellRfq` as fully-typed `Rfq` literals (Biome's `useExplicitType` flags untyped file-scope object literals in tests); only the throwaway quote factory takes the shortcut.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/credit/rfqTiles/bestQuote.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Port the implementation**

Copy the body of `findBestQuoteId` from `rfqCardVm.ts:120`, exporting it. Keep its comments.

- [ ] **Step 4: Swap the bar for the ring in `RfqCard`**

Replace the `RfqCountdownBar` import and usage with `RfqCountdownRing`, passing `remainingMs` (already computed from `useRfqCountdown`) and `totalMs`. Delete `RfqCountdownBar.tsx` and its test.

- [ ] **Step 5: Run the package suite**

Run: `pnpm --filter @rtc/client-react-native exec jest && pnpm --filter @rtc/client-react-native exec vitest run`
Expected: PASS, with no references left to `RfqCountdownBar`.

- [ ] **Step 6: Commit**

```bash
git add -A packages/client-react-native/src/ui/credit
git commit -m "feat(rn-credit): port findBestQuoteId and adopt the countdown ring"
```

---

## Task 4: Streaming quote rows — best-quote tint, AWAITING pulse, ACCEPT ripple

**Files:**
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/AwaitingLabel.tsx` (+ test)
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/AcceptPulse.tsx` (+ test)
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/QuoteCard.tsx` (+ its test)

**Interfaces:**
- Consumes: `findBestQuoteId` (Task 3), `useShellMotionEnabled()`.
- Produces: `<AwaitingLabel />`; `<AcceptPulse />` (an absolutely-positioned overlay, `pointerEvents="none"`).

**The ripple is a translation, not a port.** The prototype's `kfPulse` animates `box-shadow` out to a 9 px ring (dc.html:38). RN cannot animate `box-shadow`, and the perf doctrine forbids it anyway. Reproduce it as an overlay View that loops `scale` 1 → ~1.45 with `opacity` 0.55 → 0 — transform/opacity only, same read at this size.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("AwaitingLabel", () => {
  it("renders the AWAITING copy", async () => {
    await renderWithTheme(<AwaitingLabel />);
    expect(screen.getByText(/AWAITING/)).toBeTruthy();
  });
});

describe("AcceptPulse", () => {
  it("renders nothing when motion is disabled", async () => {
    // seed the preferences simulator with power-saver freeze, then:
    await renderWithTheme(<AcceptPulse />);
    expect(screen.queryByTestId("accept-pulse")).toBeNull();
  });

  it("renders the ripple when motion is enabled", async () => {
    await renderWithTheme(<AcceptPulse />);
    expect(screen.getByTestId("accept-pulse")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `AwaitingLabel`**

A `Text` reading `AWAITING` plus an `Animated.Text` ellipsis looping `opacity` 1 → 0.35 → 1 over `AWAITING_PULSE_MS = 1100` (`kfConnPulse`, dc.html:47), via `withRepeat(withSequence(...), -1)`. Gate on `useShellMotionEnabled()`; when off, render a static ellipsis at full opacity.

- [ ] **Step 4: Implement `AcceptPulse`**

```tsx
const scale = useSharedValue(1);
const opacity = useSharedValue(PULSE_PEAK_OPACITY);

useEffect(() => {
  if (!motion) {
    return;
  }

  scale.value = withRepeat(
    withTiming(PULSE_MAX_SCALE, { duration: PULSE_MS }),
    -1,
    false,
  );
  opacity.value = withRepeat(withTiming(0, { duration: PULSE_MS }), -1, false);
}, [motion, scale, opacity]);
```

Return `null` when `!motion`. Constants: `PULSE_MS = 1400`, `PULSE_MAX_SCALE = 1.45`, `PULSE_PEAK_OPACITY = 0.55`. Mark every helper the animated style reaches `"worklet"`, **declared above its caller**.

- [ ] **Step 5: Wire into `QuoteCard`**

Tint the best-quote row (`findBestQuoteId`), show `<AwaitingLabel />` when a pending quote has no price, and mount `<AcceptPulse />` behind the ACCEPT button only for the best priced quote.

- [ ] **Step 6: Run tests + gates**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit && pnpm check:worklet-order && pnpm --filter @rtc/tests gates`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A packages/client-react-native/src/ui/credit/rfqTiles
git commit -m "feat(rn-credit): best-quote tint, AWAITING pulse and ACCEPT ripple"
```

---

## Task 5: Accept ceremony — stamp, linger, exit

**Files:**
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCard.tsx` (+ test)

**Interfaces:**
- Consumes: Phase 4a's `ExecutionCeremony` (`#/ui/rates/ticket/ExecutionCeremony`) for the stamp spring.

**⚠️ The linger may not be a UI-side timer.** `src/ui` may not use them and the gate greps prose. Two legal routes, in preference order:

1. **Encode it as the exit animation's duration.** Reanimated's `FadeOut.duration(ACCEPT_LINGER_MS)` holds the card on screen while it fades — the linger *is* the exit, no timer.
2. **Drive it from observed seam state.** The card leaves when the filtered list stops including it; the prototype does exactly this (dc.html:2127-2129 — accepted cards linger in LIVE until dismissed). Prefer this if route 1 reads too fast.

- [ ] **Step 1: Write the failing test**

```tsx
it("shows the ACCEPTED stamp once the rfq is accepted", async () => {
  await renderWithTheme(<RfqCard rfq={acceptedRfq} quotes={quotes} /* … */ />);
  expect(screen.getByText(/ACCEPTED/)).toBeTruthy();
});

it("does not render the stamp while the rfq is live", async () => {
  await renderWithTheme(<RfqCard rfq={liveRfq} quotes={quotes} /* … */ />);
  expect(screen.queryByText(/ACCEPTED/)).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles/RfqCard.test.tsx`
Expected: FAIL — no stamp rendered.

- [ ] **Step 3: Implement the stamp**

Mount the stamp when `rfq.state` is accepted, reusing `ExecutionCeremony`'s spring. Match `kfStamp` (dc.html:37): `scale 1.7 → 0.96 → 1` with `rotate -7deg → 1deg → 0`, opacity 0 → 1 by 55%.

- [ ] **Step 4: Implement the exit**

Give the card `exiting={FadeOut.duration(ACCEPT_LINGER_MS)}` with `ACCEPT_LINGER_MS = 1250`, and add a doc comment stating plainly that this duration **is** the linger — so nobody later "fixes" it by adding a timer.

- [ ] **Step 5: Run tests + the prose gate**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit && pnpm --filter @rtc/tests gates`
Expected: PASS. The gates step is the one that catches an accidental `setTimeout` in a comment.

- [ ] **Step 6: Commit**

```bash
git add -A packages/client-react-native/src/ui/credit/rfqTiles
git commit -m "feat(rn-credit): accept ceremony with a timer-free linger"
```

---

## Task 6: New-RFQ cascade on the tiles list

**Files:**
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/RfqTilesPanel.tsx` (+ test)

**Interfaces:**
- Consumes: `useRfqs()`, `useShellMotionEnabled()`.

This is the 4b Blotter idiom verbatim — read `src/ui/blotter/BlotterModule.tsx` first and mirror it.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders one card per rfq", async () => {
  await renderWithTheme(<RfqTilesPanel />);
  expect(screen.getAllByTestId(/^rfq-card-/)).toHaveLength(3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles/RfqTilesPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Wrap each card in `Animated.View` with `layout={LinearTransition}`, `entering={FadeInDown.duration(350)}` (`kfTileIn 0.35s`, dc.html:222), `exiting={FadeOut}`. Gate all three on `useShellMotionEnabled()` — pass `undefined` when off.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client-react-native/src/ui/credit/rfqTiles
git commit -m "feat(rn-credit): new-rfq cascade on the tiles list"
```

---

## Task 7: New-RFQ form reshape

**Files:**
- Create: `packages/client-react-native/src/ui/credit/newRfq/InstrumentChipGrid.tsx` (+ test)
- Create: `packages/client-react-native/src/ui/credit/newRfq/QuantityChips.tsx` (+ test)
- Modify: `packages/client-react-native/src/ui/credit/newRfq/NewRfqForm.tsx` (+ test)
- Delete: `packages/client-react-native/src/ui/credit/newRfq/InstrumentSearch.tsx`, `QuantityInput.tsx`, `DealerSelection.tsx` (+ their tests)

**Interfaces:**
- Consumes: `useInstruments()`, `useRfqSubmission()`.

**Deleting the dealer list is deliberate** (spec §5a). The seam still needs a non-empty `dealerIds`; the existing "default to all dealers" fallback satisfies it. Verify that fallback exists in `useRfqSubmission()` **before** deleting the component — if it does not, stop and raise it rather than sending an empty array.

- [ ] **Step 1: Write the failing tests**

```tsx
const instruments: readonly Instrument[] = [
  { id: 1, name: "US 10Y" } as Instrument,
  { id: 2, name: "DE 10Y" } as Instrument,
];

describe("InstrumentChipGrid", () => {
  it("renders a chip per instrument and reports the pressed one", async () => {
    const picked: number[] = [];
    await renderWithTheme(
      <InstrumentChipGrid
        instruments={instruments}
        selectedId={null}
        onSelect={(id) => picked.push(id)}
      />,
    );

    expect(screen.getAllByTestId(/^instrument-chip-/)).toHaveLength(2);

    await fireEvent.press(screen.getByTestId("instrument-chip-2"));

    expect(picked).toEqual([2]);
  });

  // The prototype hardcodes six; real `useInstruments()` data does not. A
  // seventh must still be reachable, which is why this is a ScrollView.
  it("renders every instrument when there are more than six", async () => {
    const many = Array.from({ length: 9 }, (_, i) => {
      return { id: i + 1, name: `INST ${i + 1}` } as Instrument;
    });
    await renderWithTheme(
      <InstrumentChipGrid instruments={many} selectedId={null} onSelect={() => {}} />,
    );

    expect(screen.getAllByTestId(/^instrument-chip-/)).toHaveLength(9);
  });
});

describe("QuantityChips", () => {
  it("renders the fixed quantity chips and reports the pressed one", async () => {
    const picked: number[] = [];
    await renderWithTheme(
      <QuantityChips selected={null} onSelect={(q) => picked.push(q)} />,
    );

    expect(screen.getAllByTestId(/^quantity-chip-/).length).toBeGreaterThan(0);

    await fireEvent.press(screen.getAllByTestId(/^quantity-chip-/)[0]);

    expect(picked).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/newRfq`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both chip components**

Both are horizontal `ScrollView`s. **Both MUST set `style={{ flexGrow: 0, flexShrink: 0 }}` and `contentContainerStyle={{ alignItems: "center" }}`** — the Phase 4a bug. The instrument grid maps real `useInstruments()` data, so a count ≠ 6 still works.

- [ ] **Step 4: Rewire `NewRfqForm` and delete the three old components**

Confirm nothing else imports them: `grep -rn "InstrumentSearch\|QuantityInput\|DealerSelection" packages/client-react-native/src`.

- [ ] **Step 5: Run tests + knip**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit && pnpm lint:dead`
Expected: PASS — knip catches any now-orphaned export.

- [ ] **Step 6: Commit**

```bash
git add -A packages/client-react-native/src/ui/credit/newRfq
git commit -m "feat(rn-credit): chip-grid new-rfq form, drop the dealer picker"
```

---

## Task 8: Filter tabs — adopt the 3-way shared preference

**Files:**
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/RfqFilterTabs.tsx` (+ test)
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/rfqTileFilter.ts` (+ test)

**Interfaces:**
- Consumes: `useCreditRfqFilterPreference()` from the ViewModel (`createViewModel.ts:280`).
- Produces: filter values narrowed to the domain's `CreditRfqFilter = "live" | "closed" | "all"`.

RN currently holds a local 5-way `useState` (`Live/All/Done/Expired/Cancelled`). Prototype and domain are both 3-way (`LIVE`/`DONE`/`ALL`, dc.html:2121). This replaces local state with the shared seam, aligning RN with web and the prototype at once, and closes the "Credit filter alignment" item in `docs/rn-open-items.md` §6.

- [ ] **Step 1: Write the failing test**

```ts
const live = { id: 1, state: RfqState.Live } as Rfq;
const done = { id: 2, state: RfqState.Accepted } as Rfq;

it("keeps only live rfqs under the live filter", () => {
  expect(rfqTileFilter([live, done], "live")).toEqual([live]);
});

it("keeps only non-live rfqs under the closed filter", () => {
  expect(rfqTileFilter([live, done], "closed")).toEqual([done]);
});

it("keeps everything under the all filter", () => {
  expect(rfqTileFilter([live, done], "all")).toEqual([live, done]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/credit/rfqTiles/rfqTileFilter.test.ts`
Expected: FAIL — the 5-way union is still in place.

- [ ] **Step 3: Implement**

Narrow `rfqTileFilter` to the domain union; replace the local `useState` in `RfqFilterTabs` with `useCreditRfqFilterPreference()`. Chip row keeps the `flexGrow: 0` / `flexShrink: 0` / `alignItems: "center"` trio.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit && pnpm --filter @rtc/client-react-native exec vitest run src/ui/credit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client-react-native/src/ui/credit/rfqTiles
git commit -m "feat(rn-credit): adopt the shared 3-way rfq filter preference"
```

---

## Task 9: Sell-side — prototype chrome over the real open-ticket list

**Files:**
- Create: `packages/client-react-native/src/ui/credit/sellSide/PriceStepper.tsx` (+ test)
- Create: `packages/client-react-native/src/ui/credit/sellSide/SellSideTicket.tsx` (+ test)
- Modify: `packages/client-react-native/src/ui/credit/sellSide/SellSidePanel.tsx` (+ test)
- Delete: `packages/client-react-native/src/ui/credit/sellSide/TradeTicket.tsx` (+ test)

**Interfaces:**
- Consumes: `useRfqs()`, `useQuotesForRfq()`, `useRfqCountdown()`, `useTicketSubmission()`, `RfqCountdownRing` (Task 2).
- Produces: `<PriceStepper value={number} onChange={(next: number) => void} />` — `onChange` is a **slot** and correctly named `onX`; the concrete handler inside `SellSideTicket` must be named for its effect.

**This is the task the design spec spends the most words on — re-read §3.1 before starting.** The prototype shows *one* rotating incoming ticket plus a client-local WON/LOST history. The seam has *many* simultaneously-open RFQs and no history stream. Build the prototype's chrome around **each real open ticket in a list**. Won/lost comes from real `QuoteState` (`accepted` → won, `rejectedWithPrice` → lost) — **do not invent a 2600 ms resolve timer**.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("PriceStepper", () => {
  it("steps up by 0.05", async () => {
    const changes: number[] = [];
    await renderWithTheme(
      <PriceStepper value={1.20} onChange={(n) => changes.push(n)} />,
    );
    await fireEvent.press(screen.getByTestId("price-stepper-up"));

    expect(changes).toEqual([1.25]);
  });

  it("steps down by 0.05", async () => {
    const changes: number[] = [];
    await renderWithTheme(
      <PriceStepper value={1.20} onChange={(n) => changes.push(n)} />,
    );
    await fireEvent.press(screen.getByTestId("price-stepper-down"));

    expect(changes).toEqual([1.15]);
  });

  it("does not step below zero", async () => {
    const changes: number[] = [];
    await renderWithTheme(
      <PriceStepper value={0.02} onChange={(n) => changes.push(n)} />,
    );
    await fireEvent.press(screen.getByTestId("price-stepper-down"));

    expect(changes).toEqual([0]);
  });
});

describe("SellSidePanel", () => {
  // THE §3.1 DECISION, ENCODED. The prototype shows one rotating ticket; the
  // seam has many open at once. If this ever passes with a length of 1, the
  // panel has quietly reverted to the prototype's information architecture.
  it("renders a ticket per open rfq, not just the first", async () => {
    await renderWithTheme(<SellSidePanel />);

    expect(screen.getAllByTestId(/^sell-side-ticket-/)).toHaveLength(3);
  });

  it("renders an empty state when nothing is open", async () => {
    await renderWithTheme(<SellSidePanel />);

    expect(screen.getByTestId("sell-side-empty")).toBeTruthy();
  });
});
```

The first `SellSidePanel` case is the one that encodes the §3.1 decision — keep it.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/sellSide`
Expected: FAIL.

- [ ] **Step 3: Implement `PriceStepper`**

44×44 `Pressable`s, `borderRadius: 9`, 1px border, `--acc` text at 16px; centred price `24px/700` mono; `gap: 9` (dc.html:300-302). `PRICE_STEP = 0.05`. Clamp at zero.

- [ ] **Step 4: Implement `SellSideTicket`**

Card chrome per dc.html:292-303 — `◈ INCOMING RFQ` in `--aware`, the seconds readout, the 2px progress bar (`width 1s linear, background 0.4s`), instrument, `CLIENT SELLS · {qty} · {counterparty}`, the stepper, and the full-width submit. **The prototype uses a bar here, not a ring** — do not substitute `RfqCountdownRing`; that would be a fidelity regression dressed up as reuse.

- [ ] **Step 5: Implement `SellSidePanel` as a list**

Map every open RFQ to a `SellSideTicket`. Below it, a `YOUR QUOTES` section derived from real quote state, styled per dc.html:306-312 (status pill `8px`, `ls 1px`, `padding: 2px 6px`, `radius 4`).

- [ ] **Step 6: Delete `TradeTicket` and run everything**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit && pnpm lint:dead && pnpm check:worklet-order && pnpm --filter @rtc/tests gates`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A packages/client-react-native/src/ui/credit/sellSide
git commit -m "feat(rn-credit): sell-side ticket list in the prototype's visual language"
```

---

## Task 10: Visual scenarios + docs

**Files:**
- Modify: `packages/client-react-native/tests/visual/scenarioIds.ts`
- Modify: `packages/client-react-native/tests/visual/scenarios.tsx`
- Generate: `packages/client-react-native/tests/visual/maestro/flows/credit_*.yaml`
- Modify: `docs/rn-open-items.md`, `docs/STATUS.md`

**Interfaces:**
- Consumes: `ScreenContentFixture`, `VisualScenarioHost`.

**Two traps, both paid for already:**
1. `credit/rfq-tiles-empty` was dropped once for non-determinism — `CreditRfqSimulator` emits new Live RFQs over time, so the empty view is momentary (re-captures swung 0.7% ↔ 11.9%). **Any Credit scenario must pin its data**, mounting a presentational component over a literal list the way `AnalyticsDashboardFixture` does. Do not mount the live panel.
2. Credit scenarios mount **screen content**, so they must be wrapped in `ScreenContentFixture` — otherwise the status bar covers the filter chips, exactly as it hid `blotter/seeded`'s `PENDING` chip for months (PR #443).

- [ ] **Step 1: Add the scenario ids**

Add `credit/rfq-tiles` and `credit/sell-side` to `SCENARIO_IDS`, each with a comment saying why its data is pinned.

- [ ] **Step 2: Add the scenario builders**

Mount the panels' presentational forms over literal fixtures, wrapped in `ScreenContentFixture`, seeding `powerSaverLevel="freeze"` so the ring glide and ACCEPT ripple hold at rest. `forceReduceMotion` alone is **not** enough — it gates the ambient layer only.

- [ ] **Step 3: Regenerate the Maestro flows**

Run: `cd packages/client-react-native && npx tsx tests/visual/maestro/generateFlows.ts`
Expected: two new `.yaml` files; `generateFlows.test.ts` asserts the committed set equals `SCENARIO_IDS` byte-for-byte.

- [ ] **Step 4: Run the suite**

Run: `pnpm --filter @rtc/client-react-native exec jest && pnpm --filter @rtc/client-react-native exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client-react-native/tests/visual docs
git commit -m "test(rn-credit): pinned visual scenarios for rfq tiles and sell-side"
```

---

## Task 11: On-device sign-off (requires the user + a booted simulator)

**This task cannot be completed by an agent alone.** It needs a Mac with a booted iPhone 17 / iOS 26.5 simulator, the dev client installed, Metro running with `EXPO_PUBLIC_VISUAL_HARNESS=1`, and **a human looking at the screen**. It queues into the single serial native tail — it cannot run in parallel with 5b's sign-off.

- [ ] **Step 1: Run Credit on device** and watch a full RFQ lifecycle — new RFQ arrives, quotes stream in, countdown runs down, accept.
- [ ] **Step 2: Watch for the worklet crash class.** `[Worklets] Tried to synchronously call a Remote Function`, or a silently blank surface, means an unmarked or late-declared callee. `pnpm check:worklet-order` is necessary, not sufficient — it cannot see arrow-function worklets or anything dynamic.
- [ ] **Step 3: Confirm the ring glides.** It must sweep smoothly, not step ten times a second. Stepping means the `withTiming` bridge is not applied.
- [ ] **Step 4: Confirm the colour flip.** Under 10 s the ring turns negative-accent over ~0.4 s, not instantly.
- [ ] **Step 5: Confirm the ACCEPT ripple loops** on the best priced quote only, and that `AWAITING…` pulses on unpriced ones.
- [ ] **Step 6: Confirm the accept ceremony.** Stamp reads, card lingers, then leaves — **with no UI-side timer in the source.**
- [ ] **Step 7: Check the chip rows.** Four new horizontal rows; any that stretches to full height is the Phase 4a bug.
- [ ] **Step 8: Judge fidelity against the prototype** at `docs/design/mobile/v1/dev-handoff/prototype/`. Record any gap in `rn-open-items.md` rather than silently accepting it.
- [ ] **Step 9: Capture the goldens, eyeball each PNG, then run the verify pass.** It must report `pass`. Capture with `--scratch` first and promote the reviewed bytes; a bad `:update` will pin the Expo launcher as the baseline.
- [ ] **Step 10: Commit the goldens and close 5a in `docs/STATUS.md`.**

---

## References

- Phase 5 design (decisions, per-module scope, constraints): [../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md](../specs/2026-07-25-rn-mobile-v1-rehaul-phase-5-design.md)
- Phase 4a (ceremony spring, chip-row bug): [2026-07-19-rn-mobile-v1-rehaul-phase-4a-rates.md](2026-07-19-rn-mobile-v1-rehaul-phase-4a-rates.md)
- Phase 4b (list cascade idiom): [2026-07-20-rn-mobile-v1-rehaul-phase-4b-blotter.md](2026-07-20-rn-mobile-v1-rehaul-phase-4b-blotter.md)
- Worklet ordering + directive rules: [../../rn-open-items.md](../../rn-open-items.md) §5
- Visual-harness fixture rules: `packages/client-react-native/tests/visual/README.md`
- Performance doctrine: [../../performance.md](../../performance.md)
- Handler naming (`onX` is for slots only): [../../handler-naming.md](../../handler-naming.md)
