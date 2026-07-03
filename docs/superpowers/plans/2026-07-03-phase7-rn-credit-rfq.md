# Phase 7 — RN Credit RFQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the web credit RFQ desk (RFQ Tiles / New RFQ / Sell Side) to the React Native / Expo app as a 5th **Credit** tab, at full parity, as a Pure View phase.

**Architecture:** RN leaf components only, consuming already-bound ViewModel hooks (`useRfqs`, `useQuotesForRfq`, `useInstruments`, `useDealers`, `useAcceptQuote`, `useRfqSubmission`, `useTicketSubmission`, `useRfqCountdown`) and the Phase-5 theme store (`useThemedStyles(makeStyles)`). The credit ports already flow through `buildNativePorts`, so nothing in the composition or neutral layers changes. One pure filter/sort util is extracted for vitest coverage.

**Tech Stack:** React Native 0.81 / Expo SDK 55, Expo Router, RN `StyleSheet`, jest-expo + RNTL 14 (`.test.tsx`), vitest node (`.test.ts`).

## Global Constraints

- **Pure View phase.** ZERO changes under `packages/domain`, `packages/client-core`, `packages/react-bindings`, or `packages/client-react`. **No new dependencies.** No `react-native-svg` (plain themed Views). No RN `Modal` (x86-jest segfault — inline views only). No RN `Animated` (the countdown is a plain numeric re-render).
- **Every leaf** consumes `useViewModel()` hooks (destructured — never `useViewModel().useX()`, banned by `no-restricted-syntax`) and, for styling, `useThemedStyles(makeStyles)` where `makeStyles` is a **`function` declaration** returning a **named** `XxxStyles` interface (properties typed `ViewStyle`/`TextStyle`). No inline object types in param or return position (`no-restricted-syntax` bans `TSTypeLiteral` there) — extract named `interface`s (`XxxProps`, `XxxStyles`).
- **`makeStyles` is module-level** (stable identity for `useThemedStyles` memoisation).
- **Tests — two islands, run BOTH every task** via `pnpm --filter @rtc/client-react-native test` (never a scoped `jest src/...` — a stray `react-native` import silently breaks a vitest file, Phase 5 lesson):
  - `.test.tsx` → jest-expo. Import globals from `@jest/globals`. RNTL 14 `render`/`fireEvent.press` return Promises → **`await` render**, **`void fireEvent.press(...)`**. Render leaves with `renderWithTheme(...)`; for hook-consuming leaves wrap in `<ViewModelProvider viewModel={fakeViewModel(...)}>` where `fakeViewModel` implements only the used hooks and is cast `as unknown as ViewModel`.
  - `.test.ts` → vitest node. Import from `vitest`. Must stay **react-native-free** (pure TS only).
- **`testTimeout: 30_000`** is already set in the RN `jest.config.js` (Phase 4 hotfix) — do not change it.
- **Full gauntlet per task**, run first-hand with real exit codes (subagents under-run/misreport it — Phase 1 lesson). Commands from repo root:
  - `pnpm --filter @rtc/client-react-native typecheck`
  - `pnpm --filter @rtc/client-react-native test` (vitest + jest)
  - `pnpm --filter @rtc/client-react-native exec biome ci src` (capture EXIT code, not the "Checked N" line — Phase 5 lesson)
  - `pnpm lint:eslint` (default config)
  - `pnpm lint:eslint:types` (`eslint . --config eslint.config.typed.mjs` — the typed pass carries `no-floating-promises`; only it flags un-awaited RNTL calls — Phase 5 lesson)
  - `pnpm knip`, `pnpm check:versions`, `pnpm check:deps`
  - `pnpm --filter @rtc/client-react-native exec expo export --platform ios --output-dir /tmp/rn-phase7-export` (module-count smoke; expect a clean export)
- **Directory:** `packages/client-react-native/src/ui/credit/` with sub-folders `rfqTiles/`, `newRfq/`, `sellSide/`, mirroring the web.
- **Commit footer** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01W6UUmSH8EUJui4ZZrF7BMb
  ```

### Reference: domain types (already exist — do not modify)

```ts
// @rtc/domain
enum Direction { Buy = "Buy", Sell = "Sell" }
enum RfqState { Open = "Open", Expired = "Expired", Cancelled = "Cancelled", Closed = "Closed" }
interface Rfq { id: number; instrumentId: number; quantity: number; direction: Direction; state: RfqState; expirySecs: number; creationTimestamp: number; }
interface Instrument { id: number; name: string; cusip: string; ticker: string; maturity: string; interestRate: number; benchmark: string; }
interface Dealer { id: number; name: string; }
type QuoteState =
  | { type: "pendingWithoutPrice" }
  | { type: "pendingWithPrice"; price: number }
  | { type: "passed" }
  | { type: "accepted"; price: number }
  | { type: "rejectedWithPrice"; price: number }
  | { type: "rejectedWithoutPrice" };
interface Quote { id: number; rfqId: number; dealerId: number; state: QuoteState; }
interface CreateRfqInput { instrumentId: number; dealerIds: readonly number[]; quantity: number; direction: Direction; expirySecs?: number; }
const CREDIT_QUANTITY_MULTIPLIER = 1_000;
const ADAPTIVE_BANK_NAME = "Adaptive Bank";
```

### Reference: ViewModel hook shapes (already bound — do not modify)

```ts
useRfqs(): readonly Rfq[]
useQuotesForRfq(rfqId: number): readonly Quote[]
useInstruments(): readonly Instrument[]
useDealers(): readonly Dealer[]
useAcceptQuote(): (quoteId: number) => Promise<void>
useRfqCountdown(creationTimestamp: number, totalMs: number): number
useRfqSubmission(): { state: { status: "editing" } | { status: "submitting" } | { status: "confirmed"; rfqId: number }; submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => void }
useTicketSubmission(): { state: { submitted: boolean }; submitPrice: (quoteId: number, price: number) => void; pass: (quoteId: number) => void }
```

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `src/ui/credit/rfqTiles/rfqTileFilter.ts` | 1 | Pure filter+sort of RFQs by tab, excluding dismissed |
| `src/ui/credit/rfqTiles/RfqFilterTabs.tsx` | 2 | Segmented filter tabs (prop-driven) |
| `src/ui/credit/rfqTiles/RfqCountdownBar.tsx` | 2 | Progress bar + seconds caption (prop-driven) |
| `src/ui/credit/rfqTiles/QuoteCard.tsx` | 2 | One dealer quote row + Accept (prop-driven) |
| `src/ui/credit/rfqTiles/RfqCard.tsx` | 3 | RFQ header + countdown + quote list (uses `useRfqCountdown`) |
| `src/ui/credit/rfqTiles/RfqTilesPanel.tsx` | 3 | Buy-side panel: filter state, dismissed state, rows/empty (uses `useRfqs`/`useInstruments`/`useDealers`/`useAcceptQuote`, `useQuotesForRfq` per row) |
| `src/ui/credit/newRfq/InstrumentSearch.tsx` | 4 | Typeahead search + selected card (prop-driven) |
| `src/ui/credit/newRfq/QuantityInput.tsx` | 4 | Numeric quantity input (prop-driven) |
| `src/ui/credit/newRfq/DealerSelection.tsx` | 4 | Dealer multi-select checklist (prop-driven) |
| `src/ui/credit/newRfq/NewRfqForm.tsx` | 5 | Create form: draft state + `useRfqSubmission` + confirmed card |
| `src/ui/credit/sellSide/TradeTicket.tsx` | 6 | Dealer respond: price/pass (uses `useTicketSubmission`) |
| `src/ui/credit/sellSide/SellSidePanel.tsx` | 6 | Adaptive-Bank RFQs (uses `useRfqs`/`useInstruments`/`useDealers`, `useQuotesForRfq` per row) |
| `src/ui/credit/CreditNav.tsx` | 7 | Segmented sub-view nav (prop-driven) |
| `src/ui/credit/CreditScreen.tsx` | 7 | Owns `CreditView` state; renders nav + active sub-view |
| `app/credit.tsx` | 7 | Expo Router route → `CreditScreen` |
| `app/_layout.tsx` (modify) | 7 | Register the `credit` tab |

---

## Task 1: Pure RFQ filter/sort util

**Files:**
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/rfqTileFilter.ts`
- Test: `packages/client-react-native/src/ui/credit/rfqTiles/rfqTileFilter.test.ts`

**Interfaces:**
- Produces: `type RfqFilter = "Live" | "All" | "Done" | "Expired" | "Cancelled"`; `const RFQ_FILTERS: readonly RfqFilter[]`; `function filterRfqs(rfqs: readonly Rfq[], filter: RfqFilter, dismissed: ReadonlySet<number>): readonly Rfq[]`.

- [ ] **Step 1: Write the failing test**

`packages/client-react-native/src/ui/credit/rfqTiles/rfqTileFilter.test.ts`:

```ts
import { expect, test } from "vitest";

import { Direction, type Rfq, RfqState } from "@rtc/domain";

import { filterRfqs, RFQ_FILTERS } from "#/ui/credit/rfqTiles/rfqTileFilter";

function rfq(id: number, state: RfqState, ts: number): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: ts,
  };
}

test("RFQ_FILTERS lists the five tabs in order", () => {
  expect(RFQ_FILTERS).toEqual(["Live", "All", "Done", "Expired", "Cancelled"]);
});

test("Live keeps only Open RFQs", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Closed, 2)];
  expect(filterRfqs(rfqs, "Live", new Set()).map((r) => r.id)).toEqual([1]);
});

test("All keeps every non-dismissed RFQ, newest first", () => {
  const rfqs = [
    rfq(1, RfqState.Open, 1),
    rfq(2, RfqState.Closed, 3),
    rfq(3, RfqState.Expired, 2),
  ];
  expect(filterRfqs(rfqs, "All", new Set()).map((r) => r.id)).toEqual([2, 3, 1]);
});

test("dismissed ids are excluded", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Open, 2)];
  expect(filterRfqs(rfqs, "All", new Set([1])).map((r) => r.id)).toEqual([2]);
});

test("Done/Expired/Cancelled select their state", () => {
  const rfqs = [
    rfq(1, RfqState.Closed, 1),
    rfq(2, RfqState.Expired, 2),
    rfq(3, RfqState.Cancelled, 3),
  ];
  expect(filterRfqs(rfqs, "Done", new Set()).map((r) => r.id)).toEqual([1]);
  expect(filterRfqs(rfqs, "Expired", new Set()).map((r) => r.id)).toEqual([2]);
  expect(filterRfqs(rfqs, "Cancelled", new Set()).map((r) => r.id)).toEqual([3]);
});

test("does not mutate the input array", () => {
  const rfqs = [rfq(1, RfqState.Open, 1), rfq(2, RfqState.Open, 2)];
  filterRfqs(rfqs, "All", new Set());
  expect(rfqs.map((r) => r.id)).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/credit/rfqTiles/rfqTileFilter.test.ts`
Expected: FAIL — cannot resolve `#/ui/credit/rfqTiles/rfqTileFilter`.

- [ ] **Step 3: Write the implementation**

`packages/client-react-native/src/ui/credit/rfqTiles/rfqTileFilter.ts`:

```ts
import { type Rfq, RfqState } from "@rtc/domain";

/** Buy-side filter tabs. Ported from the web `RfqFilterTabs` FILTERS. */
export type RfqFilter = "Live" | "All" | "Done" | "Expired" | "Cancelled";

export const RFQ_FILTERS: readonly RfqFilter[] = [
  "Live",
  "All",
  "Done",
  "Expired",
  "Cancelled",
];

function filterMatches(state: RfqState, filter: RfqFilter): boolean {
  switch (filter) {
    case "All":
      return true;
    case "Live":
      return state === RfqState.Open;
    case "Done":
      return state === RfqState.Closed;
    case "Expired":
      return state === RfqState.Expired;
    case "Cancelled":
      return state === RfqState.Cancelled;
  }
}

/** Filter RFQs by the selected tab, dropping dismissed ids, sorted newest
 * first. Pure — no React/RN — so it stays vitest-parseable. Ported verbatim
 * from the web `RfqTilesPanel` inline filter + sort. */
export function filterRfqs(
  rfqs: readonly Rfq[],
  filter: RfqFilter,
  dismissed: ReadonlySet<number>,
): readonly Rfq[] {
  return rfqs
    .filter((r) => {
      return filterMatches(r.state, filter) && !dismissed.has(r.id);
    })
    .sort((a, b) => {
      return b.creationTimestamp - a.creationTimestamp;
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/credit/rfqTiles/rfqTileFilter.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full gauntlet** (see Global Constraints). All exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit/rfqTiles/rfqTileFilter.ts packages/client-react-native/src/ui/credit/rfqTiles/rfqTileFilter.test.ts
git commit -m "feat(rn): pure RFQ tile filter/sort util for credit desk"
```

---

## Task 2: Buy-side presentational atoms

Three prop-driven leaves (no hooks). Rendered under `renderWithTheme` alone.

**Files:**
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/RfqFilterTabs.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownBar.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/QuoteCard.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `RfqFilter`, `RFQ_FILTERS` (Task 1); `Dealer`, `Quote` (`@rtc/domain`).
- Produces:
  - `RfqFilterTabs({ selected, onChange }: { selected: RfqFilter; onChange: (f: RfqFilter) => void })`
  - `RfqCountdownBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number })`
  - `QuoteCard({ quote, dealer, onAccept }: { quote: Quote; dealer: Dealer | undefined; onAccept?: (quoteId: number) => void | Promise<void> })`

- [ ] **Step 1: Write the failing tests**

`RfqFilterTabs.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders all five filter tabs", async () => {
  await renderWithTheme(<RfqFilterTabs selected="Live" onChange={() => undefined} />);
  for (const f of ["Live", "All", "Done", "Expired", "Cancelled"]) {
    expect(screen.getByTestId(`rfq-filter-${f}`)).toBeTruthy();
  }
});

test("pressing a tab reports the new filter", async () => {
  const onChange = jest.fn<(f: string) => void>();
  await renderWithTheme(<RfqFilterTabs selected="Live" onChange={onChange} />);
  void fireEvent.press(screen.getByTestId("rfq-filter-Done"));
  expect(onChange).toHaveBeenCalledWith("Done");
});
```

`RfqCountdownBar.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { RfqCountdownBar } from "#/ui/credit/rfqTiles/RfqCountdownBar";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("shows the remaining whole seconds", async () => {
  await renderWithTheme(<RfqCountdownBar remainingMs={60_000} totalMs={120_000} />);
  expect(screen.getByText("60s remaining")).toBeTruthy();
});

test("fill width is the remaining fraction as a percentage", async () => {
  await renderWithTheme(<RfqCountdownBar remainingMs={30_000} totalMs={120_000} />);
  const fill = screen.getByTestId("rfq-countdown-fill");
  expect(fill.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: "25%" })]),
  );
});

test("clamps a negative remaining to 0s and 0% width", async () => {
  await renderWithTheme(<RfqCountdownBar remainingMs={-500} totalMs={120_000} />);
  expect(screen.getByText("0s remaining")).toBeTruthy();
  expect(screen.getByTestId("rfq-countdown-fill").props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: "0%" })]),
  );
});
```

`QuoteCard.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Dealer, Quote } from "@rtc/domain";

import { QuoteCard } from "#/ui/credit/rfqTiles/QuoteCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const DEALER: Dealer = { id: 7, name: "Bank A" };

function quote(state: Quote["state"]): Quote {
  return { id: 42, rfqId: 1, dealerId: 7, state };
}

test("shows dealer name and price for a priced quote", async () => {
  await renderWithTheme(
    <QuoteCard quote={quote({ type: "pendingWithPrice", price: 99 })} dealer={DEALER} onAccept={() => undefined} />,
  );
  expect(screen.getByText("Bank A")).toBeTruthy();
  expect(screen.getByText("$99")).toBeTruthy();
});

test("Accept fires onAccept with the quote id for a priced pending quote", async () => {
  const onAccept = jest.fn<(id: number) => void>();
  await renderWithTheme(
    <QuoteCard quote={quote({ type: "pendingWithPrice", price: 99 })} dealer={DEALER} onAccept={onAccept} />,
  );
  void fireEvent.press(screen.getByTestId("quote-accept-42"));
  expect(onAccept).toHaveBeenCalledWith(42);
});

test("no Accept button without a price or without onAccept", async () => {
  await renderWithTheme(
    <QuoteCard quote={quote({ type: "pendingWithoutPrice" })} dealer={DEALER} onAccept={() => undefined} />,
  );
  expect(screen.queryByTestId("quote-accept-42")).toBeNull();
  expect(screen.getByText("Awaiting response")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`RfqFilterTabs.tsx`:

```tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { type RfqFilter, RFQ_FILTERS } from "#/ui/credit/rfqTiles/rfqTileFilter";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface RfqFilterTabsProps {
  selected: RfqFilter;
  onChange: (filter: RfqFilter) => void;
}

export function RfqFilterTabs({
  selected,
  onChange,
}: RfqFilterTabsProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tabs}>
      {RFQ_FILTERS.map((f) => {
        const active = selected === f;
        return (
          <Pressable
            key={f}
            testID={`rfq-filter-${f}`}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              onChange(f);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>{f}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface RfqFilterTabsStyles {
  tabs: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): RfqFilterTabsStyles {
  return StyleSheet.create({
    tabs: { flexDirection: "row", gap: 6, padding: 8 },
    tab: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: t.panel,
    },
    tabActive: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: t.bgBrandPrimary,
    },
    label: { fontSize: 12, color: t.textMuted, fontFamily: t.fontDisplay },
    labelActive: {
      fontSize: 12,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
  });
}
```

`RfqCountdownBar.tsx`:

```tsx
import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface RfqCountdownBarProps {
  remainingMs: number;
  totalMs: number;
}

/** A plain progress bar + seconds caption driven by the numeric
 * `useRfqCountdown` hook (re-renders every 100ms). No `Animated` — the value
 * itself changes, so the bar width follows via a normal re-render. Ported from
 * the web `RfqCountdown`. */
export function RfqCountdownBar({
  remainingMs,
  totalMs,
}: RfqCountdownBarProps): JSX.Element {
  const fraction =
    totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const warn = fraction <= 0.3;
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrapper}>
      <View style={styles.track}>
        <View
          testID="rfq-countdown-fill"
          style={[
            warn ? styles.fillWarn : styles.fill,
            { width: `${fraction * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.caption}>{seconds}s remaining</Text>
    </View>
  );
}

interface RfqCountdownBarStyles {
  wrapper: ViewStyle;
  track: ViewStyle;
  fill: ViewStyle;
  fillWarn: ViewStyle;
  caption: TextStyle;
}

function makeStyles(t: RnTheme): RfqCountdownBarStyles {
  return StyleSheet.create({
    wrapper: { gap: 4, paddingVertical: 4 },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: t.bgSecondary,
      overflow: "hidden",
    },
    fill: { height: 4, borderRadius: 2, backgroundColor: t.accentPrimary },
    fillWarn: { height: 4, borderRadius: 2, backgroundColor: t.accentNegative },
    caption: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
  });
}
```

Note: the `width` is an inline object in the `style` array — legal in `client-react-native` (the inline-`style={{…}}` ban is scoped to `client-react`/`client-prototype` only). The test asserts on the array via `expect.arrayContaining([expect.objectContaining({ width })])`.

`QuoteCard.tsx`:

```tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Dealer, Quote } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface QuoteCardProps {
  quote: Quote;
  dealer: Dealer | undefined;
  onAccept?: (quoteId: number) => void | Promise<void>;
}

export function QuoteCard({
  quote,
  dealer,
  onAccept,
}: QuoteCardProps): JSX.Element {
  const canAccept = quote.state.type === "pendingWithPrice" && onAccept != null;
  const styles = useThemedStyles(makeStyles);

  function handleAccept(): void {
    if (quote.state.type === "pendingWithPrice" && onAccept) {
      void onAccept(quote.id);
    }
  }

  return (
    <View style={styles.quoteCard}>
      <View style={styles.info}>
        <Text style={styles.dealerName}>
          {dealer?.name ?? `Dealer ${quote.dealerId}`}
        </Text>
        <Text style={styles.priceText}>{displayText(quote.state)}</Text>
      </View>
      {canAccept ? (
        <Pressable
          testID={`quote-accept-${quote.id}`}
          style={styles.acceptBtn}
          onPress={handleAccept}
        >
          <Text style={styles.acceptLabel}>Accept</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function displayText(state: Quote["state"]): string {
  switch (state.type) {
    case "pendingWithoutPrice":
    case "rejectedWithoutPrice":
      return "Awaiting response";
    case "pendingWithPrice":
    case "accepted":
    case "rejectedWithPrice":
      return `$${state.price}`;
    case "passed":
      return "Passed";
  }
}

interface QuoteCardStyles {
  quoteCard: ViewStyle;
  info: ViewStyle;
  dealerName: TextStyle;
  priceText: TextStyle;
  acceptBtn: ViewStyle;
  acceptLabel: TextStyle;
}

function makeStyles(t: RnTheme): QuoteCardStyles {
  return StyleSheet.create({
    quoteCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
    },
    info: { gap: 2 },
    dealerName: { fontSize: 13, color: t.textPrimary, fontFamily: t.fontDisplay },
    priceText: { fontSize: 13, color: t.textSecondary, fontFamily: t.fontMono },
    acceptBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: t.accentPositive,
    },
    acceptLabel: { fontSize: 12, color: t.textOnAccent, fontFamily: t.fontDisplay },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles`
Expected: PASS (all three files).

- [ ] **Step 5: Run the full gauntlet.** All exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit/rfqTiles/RfqFilterTabs.tsx packages/client-react-native/src/ui/credit/rfqTiles/RfqFilterTabs.test.tsx packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownBar.tsx packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownBar.test.tsx packages/client-react-native/src/ui/credit/rfqTiles/QuoteCard.tsx packages/client-react-native/src/ui/credit/rfqTiles/QuoteCard.test.tsx
git commit -m "feat(rn): credit buy-side atoms — filter tabs, countdown bar, quote card"
```

---

## Task 3: RFQ card + buy-side tiles panel

**Files:**
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCard.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/src/ui/credit/rfqTiles/RfqTilesPanel.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `RfqCountdownBar`, `QuoteCard` (Task 2); `filterRfqs`, `RfqFilter`, `RFQ_FILTERS` (Task 1); `RfqFilterTabs` (Task 2); `useRfqCountdown`, `useRfqs`, `useQuotesForRfq`, `useInstruments`, `useDealers`, `useAcceptQuote` (ViewModel).
- Produces:
  - `RfqCard({ rfq, quotes, instrument, dealers, onAccept, onDismiss }: { rfq: Rfq; quotes: readonly Quote[]; instrument: Instrument | undefined; dealers: readonly Dealer[]; onAccept: (quoteId: number) => void | Promise<void>; onDismiss: (rfqId: number) => void })`
  - `RfqTilesPanel()` — no props.

- [ ] **Step 1: Write the failing tests**

`RfqCard.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import {
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENT: Instrument = {
  id: 1,
  name: "Acme 5.5% 2030",
  cusip: "000000AA1",
  ticker: "ACME",
  maturity: "2030",
  interestRate: 5.5,
  benchmark: "T 4.0 2030",
};
const DEALERS: readonly Dealer[] = [{ id: 7, name: "Bank A" }];

function rfq(state: RfqState): Rfq {
  return {
    id: 3,
    instrumentId: 1,
    quantity: 25,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function fakeViewModel(remainingMs: number): ViewModel {
  return {
    useRfqCountdown: () => {
      return remainingMs;
    },
  } as unknown as ViewModel;
}

function renderCard(rfqValue: Rfq, quotes: readonly Quote[]): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(60_000)}>
      <RfqCard
        rfq={rfqValue}
        quotes={quotes}
        instrument={INSTRUMENT}
        dealers={DEALERS}
        onAccept={() => undefined}
        onDismiss={() => undefined}
      />
    </ViewModelProvider>,
  );
}

test("shows instrument, direction/qty and a Live badge for an open RFQ", async () => {
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.getByText("Acme 5.5% 2030")).toBeTruthy();
  expect(screen.getByText("Buy | Qty: 25")).toBeTruthy();
  expect(screen.getByTestId("rfq-badge-3")).toHaveTextContent("Live");
});

test("renders the countdown only while open", async () => {
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.getByTestId("rfq-countdown-fill")).toBeTruthy();
});

test("no countdown and a dismiss button when closed", async () => {
  await renderCard(rfq(RfqState.Closed), []);
  expect(screen.queryByTestId("rfq-countdown-fill")).toBeNull();
  expect(screen.getByTestId("rfq-dismiss-3")).toBeTruthy();
});

test("renders a quote per quote", async () => {
  const quotes: Quote[] = [
    { id: 42, rfqId: 3, dealerId: 7, state: { type: "pendingWithPrice", price: 99 } },
  ];
  await renderCard(rfq(RfqState.Open), quotes);
  expect(screen.getByTestId("quote-accept-42")).toBeTruthy();
});
```

`RfqTilesPanel.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
  },
];
const DEALERS: readonly Dealer[] = [{ id: 7, name: "Bank A" }];

function rfq(id: number, state: RfqState): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: id,
  };
}

interface FakeOpts {
  rfqs: readonly Rfq[];
  accept?: (id: number) => Promise<void>;
}

function fakeViewModel(opts: FakeOpts): ViewModel {
  return {
    useRfqs: () => {
      return opts.rfqs;
    },
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return DEALERS;
    },
    useAcceptQuote: () => {
      return opts.accept ?? (() => Promise.resolve());
    },
    useQuotesForRfq: () => {
      return [] as readonly Quote[];
    },
    useRfqCountdown: () => {
      return 60_000;
    },
  } as unknown as ViewModel;
}

function renderPanel(opts: FakeOpts): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(opts)}>
      <RfqTilesPanel />
    </ViewModelProvider>,
  );
}

test("defaults to the Live filter and lists open RFQs", async () => {
  await renderPanel({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  expect(screen.getByTestId("rfq-card-1")).toBeTruthy();
  expect(screen.queryByTestId("rfq-card-2")).toBeNull();
});

test("switching to All reveals closed RFQs", async () => {
  await renderPanel({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  void fireEvent.press(screen.getByTestId("rfq-filter-All"));
  expect(screen.getByTestId("rfq-card-2")).toBeTruthy();
});

test("empty state when no RFQs match", async () => {
  await renderPanel({ rfqs: [rfq(2, RfqState.Closed)] });
  expect(screen.getByTestId("credit-tiles-empty")).toBeTruthy();
});

test("dismissing a closed RFQ removes it from the list", async () => {
  await renderPanel({ rfqs: [rfq(2, RfqState.Closed)] });
  void fireEvent.press(screen.getByTestId("rfq-filter-All"));
  expect(screen.getByTestId("rfq-card-2")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("rfq-dismiss-2"));
  expect(screen.queryByTestId("rfq-card-2")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles/RfqCard src/ui/credit/rfqTiles/RfqTilesPanel`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`RfqCard.tsx`:

```tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import {
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { QuoteCard } from "#/ui/credit/rfqTiles/QuoteCard";
import { RfqCountdownBar } from "#/ui/credit/rfqTiles/RfqCountdownBar";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface RfqCardProps {
  rfq: Rfq;
  quotes: readonly Quote[];
  instrument: Instrument | undefined;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => void | Promise<void>;
  onDismiss: (rfqId: number) => void;
}

export function RfqCard({
  rfq,
  quotes,
  instrument,
  dealers,
  onAccept,
  onDismiss,
}: RfqCardProps): JSX.Element {
  const totalMs = rfq.expirySecs * 1000;
  const { useRfqCountdown } = useViewModel();
  const remainingMs = useRfqCountdown(rfq.creationTimestamp, totalMs);
  const styles = useThemedStyles(makeStyles);

  const dealerMap = new Map<number, Dealer>();
  for (const d of dealers) {
    dealerMap.set(d.id, d);
  }

  const canDismiss = rfq.state !== RfqState.Open;

  return (
    <View style={styles.card} testID={`rfq-card-${rfq.id}`}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.instrumentName}>
            {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
          </Text>
          <Text style={styles.instrumentMeta}>
            {rfq.direction} | Qty: {rfq.quantity.toLocaleString()}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.badge} testID={`rfq-badge-${rfq.id}`}>
            {stateLabel(rfq.state)}
          </Text>
          {canDismiss ? (
            <Pressable
              testID={`rfq-dismiss-${rfq.id}`}
              style={styles.dismissBtn}
              onPress={() => {
                onDismiss(rfq.id);
              }}
            >
              <Text style={styles.dismissText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {rfq.state === RfqState.Open ? (
        <RfqCountdownBar remainingMs={remainingMs} totalMs={totalMs} />
      ) : null}

      <View style={styles.quoteList}>
        {quotes.map((quote) => {
          return (
            <QuoteCard
              key={quote.id}
              quote={quote}
              dealer={dealerMap.get(quote.dealerId)}
              onAccept={rfq.state === RfqState.Open ? onAccept : undefined}
            />
          );
        })}
      </View>
    </View>
  );
}

function stateLabel(state: RfqState): string {
  switch (state) {
    case RfqState.Open:
      return "Live";
    case RfqState.Closed:
      return "Done";
    case RfqState.Expired:
      return "Expired";
    case RfqState.Cancelled:
      return "Cancelled";
  }
}

interface RfqCardStyles {
  card: ViewStyle;
  header: ViewStyle;
  headerLeft: ViewStyle;
  headerRight: ViewStyle;
  instrumentName: TextStyle;
  instrumentMeta: TextStyle;
  badge: TextStyle;
  dismissBtn: ViewStyle;
  dismissText: TextStyle;
  quoteList: ViewStyle;
}

function makeStyles(t: RnTheme): RfqCardStyles {
  return StyleSheet.create({
    card: {
      gap: 8,
      padding: 12,
      marginHorizontal: 8,
      marginVertical: 4,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    headerLeft: { gap: 2, flexShrink: 1 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    instrumentName: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    instrumentMeta: { fontSize: 12, color: t.textMuted, fontFamily: t.fontMono },
    badge: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    dismissBtn: { paddingHorizontal: 6, paddingVertical: 2 },
    dismissText: { fontSize: 14, color: t.textMuted },
    quoteList: { gap: 6 },
  });
}
```

`RfqTilesPanel.tsx`:

```tsx
import type { JSX } from "react";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Dealer, Instrument, Rfq } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { type RfqFilter, filterRfqs } from "#/ui/credit/rfqTiles/rfqTileFilter";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function RfqTilesPanel(): JSX.Element {
  const { useRfqs, useInstruments, useDealers, useAcceptQuote } =
    useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const acceptQuote = useAcceptQuote();
  const [filter, setFilter] = useState<RfqFilter>("Live");
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const styles = useThemedStyles(makeStyles);

  const instrumentMap = new Map<number, Instrument>();
  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  const visible = filterRfqs(rfqs, filter, dismissed);

  async function handleAccept(quoteId: number): Promise<void> {
    await acceptQuote(quoteId);
  }

  function handleDismiss(rfqId: number): void {
    setDismissed((prev) => {
      return new Set(prev).add(rfqId);
    });
  }

  return (
    <View style={styles.panel} testID="credit-tiles-panel">
      <RfqFilterTabs selected={filter} onChange={setFilter} />
      {visible.length === 0 ? (
        <Text style={styles.empty} testID="credit-tiles-empty">
          No RFQs to display
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visible.map((rfq) => {
            return (
              <RfqTileRow
                key={rfq.id}
                rfq={rfq}
                instrumentMap={instrumentMap}
                dealers={dealers}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

interface RfqTileRowProps {
  rfq: Rfq;
  instrumentMap: Map<number, Instrument>;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => Promise<void>;
  onDismiss: (rfqId: number) => void;
}

function RfqTileRow({
  rfq,
  instrumentMap,
  dealers,
  onAccept,
  onDismiss,
}: RfqTileRowProps): JSX.Element {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  return (
    <RfqCard
      rfq={rfq}
      quotes={quotes}
      instrument={instrumentMap.get(rfq.instrumentId)}
      dealers={dealers}
      onAccept={onAccept}
      onDismiss={onDismiss}
    />
  );
}

interface RfqTilesPanelStyles {
  panel: ViewStyle;
  grid: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): RfqTilesPanelStyles {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    grid: { paddingVertical: 4 },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
```

Note: `RfqTileRow` is a module-scope component defined **below** its consumer `RfqTilesPanel`; that matches the web `RfqTilesPanel`/`RfqTileRow` order and the RN `Blotter` file convention (helper components below the exported one). It is used only inside this file (not exported), so `knip` will not flag it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/rfqTiles/RfqCard src/ui/credit/rfqTiles/RfqTilesPanel`
Expected: PASS.

- [ ] **Step 5: Run the full gauntlet.** All exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit/rfqTiles/RfqCard.tsx packages/client-react-native/src/ui/credit/rfqTiles/RfqCard.test.tsx packages/client-react-native/src/ui/credit/rfqTiles/RfqTilesPanel.tsx packages/client-react-native/src/ui/credit/rfqTiles/RfqTilesPanel.test.tsx
git commit -m "feat(rn): credit buy-side RFQ card + tiles panel"
```

---

## Task 4: New-RFQ form atoms

Three prop-driven leaves (no hooks).

**Files:**
- Create: `packages/client-react-native/src/ui/credit/newRfq/InstrumentSearch.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/src/ui/credit/newRfq/QuantityInput.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/src/ui/credit/newRfq/DealerSelection.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `Instrument`, `Dealer`, `CREDIT_QUANTITY_MULTIPLIER` (`@rtc/domain`).
- Produces:
  - `InstrumentSearch({ instruments, selected, onSelect }: { instruments: readonly Instrument[]; selected: Instrument | null; onSelect: (i: Instrument | null) => void })`
  - `QuantityInput({ value, onChange }: { value: string; onChange: (v: string) => void })`
  - `DealerSelection({ dealers, selectedIds, onChange }: { dealers: readonly Dealer[]; selectedIds: Set<number>; onChange: (ids: Set<number>) => void })`

- [ ] **Step 1: Write the failing tests**

`InstrumentSearch.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Instrument } from "@rtc/domain";

import { InstrumentSearch } from "#/ui/credit/newRfq/InstrumentSearch";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
  },
  {
    id: 2,
    name: "Globex 3% 2028",
    cusip: "111111BB2",
    ticker: "GLBX",
    maturity: "2028",
    interestRate: 3,
    benchmark: "T 3.5 2028",
  },
];

test("typing filters instruments and selecting reports it", async () => {
  const onSelect = jest.fn<(i: Instrument | null) => void>();
  await renderWithTheme(
    <InstrumentSearch instruments={INSTRUMENTS} selected={null} onSelect={onSelect} />,
  );
  void fireEvent.changeText(screen.getByTestId("instrument-search-input"), "glbx");
  void fireEvent.press(screen.getByTestId("instrument-result-2"));
  expect(onSelect).toHaveBeenCalledWith(INSTRUMENTS[1]);
});

test("shows the selected instrument with a Change control", async () => {
  const onSelect = jest.fn<(i: Instrument | null) => void>();
  await renderWithTheme(
    <InstrumentSearch instruments={INSTRUMENTS} selected={INSTRUMENTS[0]} onSelect={onSelect} />,
  );
  expect(screen.getByText("Acme 5.5% 2030")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("instrument-change"));
  expect(onSelect).toHaveBeenCalledWith(null);
});
```

`QuantityInput.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { QuantityInput } from "#/ui/credit/newRfq/QuantityInput";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("reports typed quantity", async () => {
  const onChange = jest.fn<(v: string) => void>();
  await renderWithTheme(<QuantityInput value="" onChange={onChange} />);
  void fireEvent.changeText(screen.getByTestId("quantity-input"), "250");
  expect(onChange).toHaveBeenCalledWith("250");
});
```

`DealerSelection.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Dealer } from "@rtc/domain";

import { DealerSelection } from "#/ui/credit/newRfq/DealerSelection";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const DEALERS: readonly Dealer[] = [
  { id: 1, name: "Bank A" },
  { id: 2, name: "Bank B" },
];

test("toggling an unchecked dealer adds it to the selection", async () => {
  const onChange = jest.fn<(ids: Set<number>) => void>();
  await renderWithTheme(
    <DealerSelection dealers={DEALERS} selectedIds={new Set([1])} onChange={onChange} />,
  );
  void fireEvent.press(screen.getByTestId("dealer-2"));
  expect(onChange).toHaveBeenCalledWith(new Set([1, 2]));
});

test("toggling a checked dealer removes it", async () => {
  const onChange = jest.fn<(ids: Set<number>) => void>();
  await renderWithTheme(
    <DealerSelection dealers={DEALERS} selectedIds={new Set([1, 2])} onChange={onChange} />,
  );
  void fireEvent.press(screen.getByTestId("dealer-1"));
  expect(onChange).toHaveBeenCalledWith(new Set([2]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/newRfq`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`InstrumentSearch.tsx`:

```tsx
import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

import type { Instrument } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface InstrumentSearchProps {
  instruments: readonly Instrument[];
  selected: Instrument | null;
  onSelect: (instrument: Instrument | null) => void;
}

export function InstrumentSearch({
  instruments,
  selected,
  onSelect,
}: InstrumentSearchProps): JSX.Element {
  const [query, setQuery] = useState("");
  const styles = useThemedStyles(makeStyles);

  const q = query.toLowerCase();
  const results = query.trim()
    ? instruments.filter((i) => {
        return (
          i.name.toLowerCase().includes(q) ||
          i.ticker.toLowerCase().includes(q) ||
          i.cusip.toLowerCase().includes(q)
        );
      })
    : [];

  function handleSelect(instrument: Instrument): void {
    onSelect(instrument);
    setQuery(instrument.name);
  }

  if (selected) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.label}>Instrument</Text>
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.selectedMeta}>
            CUSIP: {selected.cusip} | Coupon: {selected.interestRate}%
          </Text>
          <Pressable
            testID="instrument-change"
            style={styles.changeBtn}
            onPress={() => {
              onSelect(null);
              setQuery("");
            }}
          >
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Instrument</Text>
      <TextInput
        testID="instrument-search-input"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by ticker, name, or CUSIP..."
        placeholderTextColor={styles.placeholder.color}
        style={styles.searchInput}
      />
      {results.length > 0 ? (
        <View style={styles.dropdown}>
          {results.map((inst) => {
            return (
              <Pressable
                key={inst.id}
                testID={`instrument-result-${inst.id}`}
                style={styles.resultItem}
                onPress={() => {
                  handleSelect(inst);
                }}
              >
                <Text style={styles.resultName}>{inst.name}</Text>
                <Text style={styles.resultCusip}>CUSIP: {inst.cusip}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

interface InstrumentSearchStyles {
  wrapper: ViewStyle;
  label: TextStyle;
  searchInput: TextStyle;
  placeholder: TextStyle;
  dropdown: ViewStyle;
  resultItem: ViewStyle;
  resultName: TextStyle;
  resultCusip: TextStyle;
  selectedInfo: ViewStyle;
  selectedName: TextStyle;
  selectedMeta: TextStyle;
  changeBtn: ViewStyle;
  changeText: TextStyle;
}

function makeStyles(t: RnTheme): InstrumentSearchStyles {
  return StyleSheet.create({
    wrapper: { gap: 6 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    placeholder: { color: t.textMuted },
    dropdown: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      borderRadius: 6,
      backgroundColor: t.panel,
    },
    resultItem: {
      padding: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    resultName: { fontSize: 13, color: t.textPrimary, fontFamily: t.fontDisplay },
    resultCusip: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    selectedInfo: {
      gap: 4,
      padding: 10,
      borderRadius: 6,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    selectedName: {
      fontSize: 14,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    selectedMeta: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    changeBtn: { alignSelf: "flex-start", paddingVertical: 4 },
    changeText: { fontSize: 12, color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
```

`QuantityInput.tsx`:

```tsx
import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

import { CREDIT_QUANTITY_MULTIPLIER } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function QuantityInput({
  value,
  onChange,
}: QuantityInputProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        Quantity (x{CREDIT_QUANTITY_MULTIPLIER.toLocaleString()})
      </Text>
      <TextInput
        testID="quantity-input"
        keyboardType="numeric"
        value={value}
        onChangeText={onChange}
        placeholder="Enter quantity..."
        placeholderTextColor={styles.placeholder.color}
        style={styles.input}
      />
    </View>
  );
}

interface QuantityInputStyles {
  wrapper: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  placeholder: TextStyle;
}

function makeStyles(t: RnTheme): QuantityInputStyles {
  return StyleSheet.create({
    wrapper: { gap: 6 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    input: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    placeholder: { color: t.textMuted },
  });
}
```

`DealerSelection.tsx`:

```tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Dealer } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface DealerSelectionProps {
  dealers: readonly Dealer[];
  selectedIds: Set<number>;
  onChange: (ids: Set<number>) => void;
}

export function DealerSelection({
  dealers,
  selectedIds,
  onChange,
}: DealerSelectionProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  function toggle(id: number): void {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    onChange(next);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Dealers</Text>
      <View style={styles.list}>
        {dealers.map((dealer) => {
          const checked = selectedIds.has(dealer.id);
          return (
            <Pressable
              key={dealer.id}
              testID={`dealer-${dealer.id}`}
              style={styles.row}
              onPress={() => {
                toggle(dealer.id);
              }}
            >
              <Text style={styles.box}>{checked ? "☑" : "☐"}</Text>
              <Text style={styles.name}>{dealer.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface DealerSelectionStyles {
  wrapper: ViewStyle;
  label: TextStyle;
  list: ViewStyle;
  row: ViewStyle;
  box: TextStyle;
  name: TextStyle;
}

function makeStyles(t: RnTheme): DealerSelectionStyles {
  return StyleSheet.create({
    wrapper: { gap: 6 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    list: { gap: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
    box: { fontSize: 16, color: t.accentPrimary },
    name: { fontSize: 14, color: t.textPrimary, fontFamily: t.fontDisplay },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/newRfq`
Expected: PASS.

- [ ] **Step 5: Run the full gauntlet.** All exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit/newRfq/InstrumentSearch.tsx packages/client-react-native/src/ui/credit/newRfq/InstrumentSearch.test.tsx packages/client-react-native/src/ui/credit/newRfq/QuantityInput.tsx packages/client-react-native/src/ui/credit/newRfq/QuantityInput.test.tsx packages/client-react-native/src/ui/credit/newRfq/DealerSelection.tsx packages/client-react-native/src/ui/credit/newRfq/DealerSelection.test.tsx
git commit -m "feat(rn): new-RFQ form atoms — instrument search, quantity, dealer select"
```

---

## Task 5: New-RFQ form

**Files:**
- Create: `packages/client-react-native/src/ui/credit/newRfq/NewRfqForm.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `InstrumentSearch`, `QuantityInput`, `DealerSelection` (Task 4); `useInstruments`, `useDealers`, `useRfqSubmission` (ViewModel); `Direction`, `Instrument` (`@rtc/domain`).
- Produces: `NewRfqForm({ onCreated }: { onCreated: (rfqId: number) => void })`.

- [ ] **Step 1: Write the failing test**

`NewRfqForm.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  type CreateRfqInput,
  type Dealer,
  Direction,
  type Instrument,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { NewRfqForm } from "#/ui/credit/newRfq/NewRfqForm";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
  },
];
const DEALERS: readonly Dealer[] = [
  { id: 1, name: "Bank A" },
  { id: 2, name: "Bank B" },
];

type SubmitFn = (input: CreateRfqInput, onRedirect: (id: number) => void) => void;
type SubmissionState = ReturnType<ViewModel["useRfqSubmission"]>["state"];

function fakeViewModel(submit: SubmitFn, state: SubmissionState): ViewModel {
  return {
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return DEALERS;
    },
    useRfqSubmission: () => {
      return { state, submit };
    },
  } as unknown as ViewModel;
}

test("submit is disabled until an instrument and a positive quantity are set", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(submit, { status: "editing" })}>
      <NewRfqForm onCreated={() => undefined} />
    </ViewModelProvider>,
  );
  // No instrument / no quantity yet.
  void fireEvent.press(screen.getByTestId("rfq-submit"));
  expect(submit).not.toHaveBeenCalled();

  // Pick an instrument + a quantity.
  void fireEvent.changeText(screen.getByTestId("instrument-search-input"), "acme");
  void fireEvent.press(screen.getByTestId("instrument-result-1"));
  void fireEvent.changeText(screen.getByTestId("quantity-input"), "25");
  void fireEvent.press(screen.getByTestId("rfq-submit"));

  expect(submit).toHaveBeenCalledTimes(1);
  const [input] = submit.mock.calls[0];
  expect(input).toEqual({
    instrumentId: 1,
    dealerIds: [1, 2],
    quantity: 25,
    direction: Direction.Buy,
  });
});

test("renders the confirmed card in the confirmed state", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(submit, { status: "confirmed", rfqId: 77 })}
    >
      <NewRfqForm onCreated={() => undefined} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("rfq-confirmed")).toHaveTextContent("RFQ ID: 77");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/newRfq/NewRfqForm`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`NewRfqForm.tsx`:

```tsx
import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { Direction, type Instrument } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { DealerSelection } from "#/ui/credit/newRfq/DealerSelection";
import { InstrumentSearch } from "#/ui/credit/newRfq/InstrumentSearch";
import { QuantityInput } from "#/ui/credit/newRfq/QuantityInput";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

const DIRECTIONS: readonly Direction[] = [Direction.Buy, Direction.Sell];

export function NewRfqForm({ onCreated }: NewRfqFormProps): JSX.Element {
  const { useInstruments, useDealers, useRfqSubmission } = useViewModel();
  const instruments = useInstruments();
  const dealers = useDealers();
  const submission = useRfqSubmission();
  const { submit } = submission;
  const styles = useThemedStyles(makeStyles);

  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [direction, setDirection] = useState<Direction>(Direction.Buy);
  const [quantity, setQuantity] = useState("");
  const [dealerOverride, setDealerOverride] = useState<Set<number> | null>(null);

  const submitting = submission.state.status === "submitting";

  const allDealerIds = new Set(
    dealers.map((d) => {
      return d.id;
    }),
  );
  const selectedDealerIds =
    dealerOverride && dealerOverride.size > 0 ? dealerOverride : allDealerIds;

  const quantityNum = parseFloat(quantity);
  const canSubmit =
    instrument !== null &&
    !Number.isNaN(quantityNum) &&
    quantityNum > 0 &&
    selectedDealerIds.size > 0 &&
    !submitting;

  function handleSubmit(): void {
    if (!canSubmit || !instrument) {
      return;
    }

    submit(
      {
        instrumentId: instrument.id,
        dealerIds: [...selectedDealerIds],
        quantity: quantityNum,
        direction,
      },
      onCreated,
    );
  }

  if (submission.state.status === "confirmed") {
    return (
      <View style={styles.confirmedCard} testID="rfq-confirmed">
        <Text style={styles.confirmedTitle}>RFQ Created</Text>
        <Text style={styles.confirmedDetail}>
          {instrument?.name} | {direction} | RFQ ID: {submission.state.rfqId}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.form}
      contentContainerStyle={styles.content}
      testID="new-rfq-form"
    >
      <Text style={styles.formTitle}>New RFQ</Text>

      <InstrumentSearch
        instruments={instruments}
        selected={instrument}
        onSelect={setInstrument}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Direction</Text>
        <View style={styles.directionRow}>
          {DIRECTIONS.map((dir) => {
            const active = direction === dir;
            return (
              <Pressable
                key={dir}
                testID={`rfq-direction-${dir}`}
                style={active ? styles.directionBtnActive : styles.directionBtn}
                onPress={() => {
                  setDirection(dir);
                }}
              >
                <Text
                  style={active ? styles.directionLabelActive : styles.directionLabel}
                >
                  {dir}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <QuantityInput value={quantity} onChange={setQuantity} />

      <DealerSelection
        dealers={dealers}
        selectedIds={selectedDealerIds}
        onChange={setDealerOverride}
      />

      <Pressable
        testID="rfq-submit"
        disabled={!canSubmit}
        style={canSubmit ? styles.submitBtn : styles.submitBtnDisabled}
        onPress={handleSubmit}
      >
        <Text style={styles.submitLabel}>
          {submitting ? "Submitting..." : "Submit RFQ"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

interface NewRfqFormStyles {
  form: ViewStyle;
  content: ViewStyle;
  formTitle: TextStyle;
  field: ViewStyle;
  fieldLabel: TextStyle;
  directionRow: ViewStyle;
  directionBtn: ViewStyle;
  directionBtnActive: ViewStyle;
  directionLabel: TextStyle;
  directionLabelActive: TextStyle;
  submitBtn: ViewStyle;
  submitBtnDisabled: ViewStyle;
  submitLabel: TextStyle;
  confirmedCard: ViewStyle;
  confirmedTitle: TextStyle;
  confirmedDetail: TextStyle;
}

function makeStyles(t: RnTheme): NewRfqFormStyles {
  return StyleSheet.create({
    form: { flex: 1, backgroundColor: t.bgPrimary },
    content: { padding: 16, gap: 16 },
    formTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    field: { gap: 6 },
    fieldLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    directionRow: { flexDirection: "row", gap: 8 },
    directionBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    directionBtnActive: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: t.bgBrandPrimary,
      borderWidth: 1,
      borderColor: t.borderStrong,
    },
    directionLabel: { fontSize: 14, color: t.textMuted, fontFamily: t.fontDisplay },
    directionLabelActive: {
      fontSize: 14,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
    submitBtn: {
      alignItems: "center",
      paddingVertical: 14,
      borderRadius: 6,
      backgroundColor: t.accentPrimary,
    },
    submitBtnDisabled: {
      alignItems: "center",
      paddingVertical: 14,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    submitLabel: { fontSize: 14, color: t.textOnAccent, fontFamily: t.fontDisplay },
    confirmedCard: {
      margin: 16,
      padding: 20,
      borderRadius: 8,
      gap: 8,
      backgroundColor: t.panel,
      borderWidth: 1,
      borderColor: t.accentPositive,
    },
    confirmedTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: t.accentPositive,
      fontFamily: t.fontDisplay,
    },
    confirmedDetail: { fontSize: 13, color: t.textSecondary, fontFamily: t.fontMono },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/newRfq/NewRfqForm`
Expected: PASS.

- [ ] **Step 5: Run the full gauntlet.** All exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit/newRfq/NewRfqForm.tsx packages/client-react-native/src/ui/credit/newRfq/NewRfqForm.test.tsx
git commit -m "feat(rn): new-RFQ create form with submission + confirmed card"
```

---

## Task 6: Sell-side panel + trade ticket

**Files:**
- Create: `packages/client-react-native/src/ui/credit/sellSide/TradeTicket.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/src/ui/credit/sellSide/SellSidePanel.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `useTicketSubmission` (ViewModel) in `TradeTicket`; `useRfqs`, `useInstruments`, `useDealers`, `useQuotesForRfq` (ViewModel) in `SellSidePanel`; `ADAPTIVE_BANK_NAME`, `RfqState`, `Rfq`, `Quote`, `Instrument` (`@rtc/domain`).
- Produces:
  - `TradeTicket({ rfq, quote, instrument }: { rfq: Rfq; quote: Quote; instrument: Instrument | undefined })`
  - `SellSidePanel()` — no props.

- [ ] **Step 1: Write the failing tests**

`TradeTicket.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { TradeTicket } from "#/ui/credit/sellSide/TradeTicket";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENT: Instrument = {
  id: 1,
  name: "Acme 5.5% 2030",
  cusip: "000000AA1",
  ticker: "ACME",
  maturity: "2030",
  interestRate: 5.5,
  benchmark: "T 4.0 2030",
};

function rfq(state: RfqState): Rfq {
  return {
    id: 5,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function quote(state: Quote["state"]): Quote {
  return { id: 88, rfqId: 5, dealerId: 9, state };
}

interface TicketFake {
  submitPrice: (quoteId: number, price: number) => void;
  pass: (quoteId: number) => void;
  submitted?: boolean;
}

function fakeViewModel(opts: TicketFake): ViewModel {
  return {
    useTicketSubmission: () => {
      return {
        state: { submitted: opts.submitted ?? false },
        submitPrice: opts.submitPrice,
        pass: opts.pass,
      };
    },
  } as unknown as ViewModel;
}

test("submitting a valid price calls submitPrice with the quote id", async () => {
  const submitPrice = jest.fn<(q: number, p: number) => void>();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel({ submitPrice, pass: () => undefined })}>
      <TradeTicket rfq={rfq(RfqState.Open)} quote={quote({ type: "pendingWithoutPrice" })} instrument={INSTRUMENT} />
    </ViewModelProvider>,
  );
  void fireEvent.changeText(screen.getByTestId("sell-ticket-price-5"), "101.5");
  void fireEvent.press(screen.getByTestId("sell-ticket-submit-5"));
  expect(submitPrice).toHaveBeenCalledWith(88, 101.5);
});

test("Pass calls pass with the quote id", async () => {
  const pass = jest.fn<(q: number) => void>();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel({ submitPrice: () => undefined, pass })}>
      <TradeTicket rfq={rfq(RfqState.Open)} quote={quote({ type: "pendingWithoutPrice" })} instrument={INSTRUMENT} />
    </ViewModelProvider>,
  );
  void fireEvent.press(screen.getByTestId("sell-ticket-pass-5"));
  expect(pass).toHaveBeenCalledWith(88);
});

test("shows the quoted price once responded", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel({ submitPrice: () => undefined, pass: () => undefined })}>
      <TradeTicket rfq={rfq(RfqState.Open)} quote={quote({ type: "pendingWithPrice", price: 101 })} instrument={INSTRUMENT} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("Quoted: $101")).toBeTruthy();
  expect(screen.queryByTestId("sell-ticket-submit-5")).toBeNull();
});
```

`SellSidePanel.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
  },
];
const DEALERS: readonly Dealer[] = [
  { id: 9, name: ADAPTIVE_BANK_NAME },
  { id: 1, name: "Bank A" },
];

const RFQ: Rfq = {
  id: 5,
  instrumentId: 1,
  quantity: 10,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 0,
};

interface Fake {
  rfqs: readonly Rfq[];
  quotes: readonly Quote[];
}

function fakeViewModel(opts: Fake): ViewModel {
  return {
    useRfqs: () => {
      return opts.rfqs;
    },
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return DEALERS;
    },
    useQuotesForRfq: () => {
      return opts.quotes;
    },
    useTicketSubmission: () => {
      return {
        state: { submitted: false },
        submitPrice: () => undefined,
        pass: () => undefined,
      };
    },
  } as unknown as ViewModel;
}

test("renders a ticket for an Adaptive-Bank quote", async () => {
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel({
        rfqs: [RFQ],
        quotes: [{ id: 88, rfqId: 5, dealerId: 9, state: { type: "pendingWithoutPrice" } }],
      })}
    >
      <SellSidePanel />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("sell-ticket-5")).toBeTruthy();
});

test("empty state when there are no RFQs", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel({ rfqs: [], quotes: [] })}>
      <SellSidePanel />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("sell-side-empty")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/sellSide`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`TradeTicket.tsx`:

```tsx
import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

import { type Instrument, type Quote, type Rfq, RfqState } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface TradeTicketProps {
  rfq: Rfq;
  quote: Quote;
  instrument: Instrument | undefined;
}

export function TradeTicket({
  rfq,
  quote,
  instrument,
}: TradeTicketProps): JSX.Element {
  const { useTicketSubmission } = useViewModel();
  const ticket = useTicketSubmission();
  const { submitPrice, pass } = ticket;
  const [price, setPrice] = useState("");
  const styles = useThemedStyles(makeStyles);
  const submitted = ticket.state.submitted;

  const isActive =
    rfq.state === RfqState.Open && quote.state.type === "pendingWithoutPrice";
  const hasResponded = quote.state.type !== "pendingWithoutPrice";

  function handleSubmit(): void {
    const num = parseFloat(price);
    if (Number.isNaN(num) || num <= 0) {
      return;
    }

    submitPrice(quote.id, num);
  }

  function handlePass(): void {
    pass(quote.id);
  }

  return (
    <View style={styles.ticket} testID={`sell-ticket-${rfq.id}`}>
      <View style={styles.info}>
        <Text style={styles.instrumentName}>
          {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
        </Text>
        <Text style={styles.instrumentMeta}>
          {instrument?.cusip} | {rfq.direction} | Qty:{" "}
          {rfq.quantity.toLocaleString()}
        </Text>
      </View>

      {hasResponded || submitted ? (
        <Text style={styles.respondedText}>{respondedLabel(rfq, quote)}</Text>
      ) : isActive ? (
        <View style={styles.inputRow}>
          <TextInput
            testID={`sell-ticket-price-${rfq.id}`}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
            placeholder="Price"
            placeholderTextColor={styles.placeholder.color}
            style={styles.priceInput}
          />
          <Pressable
            testID={`sell-ticket-submit-${rfq.id}`}
            disabled={!price}
            style={price ? styles.submitBtn : styles.submitBtnDisabled}
            onPress={handleSubmit}
          >
            <Text style={styles.btnLabel}>Submit</Text>
          </Pressable>
          <Pressable
            testID={`sell-ticket-pass-${rfq.id}`}
            style={styles.passBtn}
            onPress={handlePass}
          >
            <Text style={styles.btnLabel}>Pass</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.closedText}>{closedLabel(rfq.state)}</Text>
      )}
    </View>
  );
}

function respondedLabel(rfq: Rfq, quote: Quote): string {
  if (quote.state.type === "passed") {
    return "Passed";
  }

  if (quote.state.type === "pendingWithPrice") {
    return `Quoted: $${quote.state.price}`;
  }

  if (rfq.state === RfqState.Cancelled) {
    return "RFQ Cancelled";
  }

  if (rfq.state === RfqState.Expired) {
    return "RFQ Expired";
  }

  return "Responded";
}

function closedLabel(state: RfqState): string {
  if (state === RfqState.Cancelled) {
    return "Cancelled";
  }

  if (state === RfqState.Expired) {
    return "Expired";
  }

  return "Closed";
}

interface TradeTicketStyles {
  ticket: ViewStyle;
  info: ViewStyle;
  instrumentName: TextStyle;
  instrumentMeta: TextStyle;
  respondedText: TextStyle;
  closedText: TextStyle;
  inputRow: ViewStyle;
  priceInput: TextStyle;
  placeholder: TextStyle;
  submitBtn: ViewStyle;
  submitBtnDisabled: ViewStyle;
  passBtn: ViewStyle;
  btnLabel: TextStyle;
}

function makeStyles(t: RnTheme): TradeTicketStyles {
  return StyleSheet.create({
    ticket: {
      gap: 8,
      padding: 12,
      marginHorizontal: 8,
      marginVertical: 4,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    info: { gap: 2 },
    instrumentName: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    instrumentMeta: { fontSize: 12, color: t.textMuted, fontFamily: t.fontMono },
    respondedText: { fontSize: 13, color: t.textSecondary, fontFamily: t.fontDisplay },
    closedText: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
    inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    priceInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 8,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    placeholder: { color: t.textMuted },
    submitBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: t.accentPositive,
    },
    submitBtnDisabled: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    passBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
    },
    btnLabel: { fontSize: 12, color: t.textOnAccent, fontFamily: t.fontDisplay },
  });
}
```

`SellSidePanel.tsx`:

```tsx
import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { ADAPTIVE_BANK_NAME, type Instrument, type Rfq } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { TradeTicket } from "#/ui/credit/sellSide/TradeTicket";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function SellSidePanel(): JSX.Element {
  const { useRfqs, useInstruments, useDealers } = useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const styles = useThemedStyles(makeStyles);

  const adaptiveBankId = dealers.find((d) => {
    return d.name === ADAPTIVE_BANK_NAME;
  })?.id;

  const instrumentMap = new Map<number, Instrument>();
  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  return (
    <View style={styles.panel} testID="sell-side-panel">
      <Text style={styles.title}>Sell Side (Adaptive Bank)</Text>
      {adaptiveBankId === undefined || rfqs.length === 0 ? (
        <Text style={styles.empty} testID="sell-side-empty">
          No RFQs for Adaptive Bank
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {rfqs.map((rfq) => {
            return (
              <SellSideRfqRow
                key={rfq.id}
                rfq={rfq}
                adaptiveBankId={adaptiveBankId}
                instrumentMap={instrumentMap}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

interface SellSideRfqRowProps {
  rfq: Rfq;
  adaptiveBankId: number;
  instrumentMap: Map<number, Instrument>;
}

function SellSideRfqRow({
  rfq,
  adaptiveBankId,
  instrumentMap,
}: SellSideRfqRowProps): JSX.Element | null {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  const abQuote = quotes.find((q) => {
    return q.dealerId === adaptiveBankId;
  });
  if (!abQuote) {
    return null;
  }

  return (
    <TradeTicket
      rfq={rfq}
      quote={abQuote}
      instrument={instrumentMap.get(rfq.instrumentId)}
    />
  );
}

interface SellSidePanelStyles {
  panel: ViewStyle;
  title: TextStyle;
  list: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): SellSidePanelStyles {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    title: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      padding: 12,
    },
    list: { paddingVertical: 4 },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/sellSide`
Expected: PASS.

- [ ] **Step 5: Run the full gauntlet.** All exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit/sellSide/TradeTicket.tsx packages/client-react-native/src/ui/credit/sellSide/TradeTicket.test.tsx packages/client-react-native/src/ui/credit/sellSide/SellSidePanel.tsx packages/client-react-native/src/ui/credit/sellSide/SellSidePanel.test.tsx
git commit -m "feat(rn): credit sell-side panel + dealer trade ticket"
```

---

## Task 7: Credit screen, nav, route + tab registration

**Files:**
- Create: `packages/client-react-native/src/ui/credit/CreditNav.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/src/ui/credit/CreditScreen.tsx` (+ `.test.tsx`)
- Create: `packages/client-react-native/app/credit.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx` (add the `credit` tab screen)

**Interfaces:**
- Consumes: `RfqTilesPanel` (Task 3), `NewRfqForm` (Task 5), `SellSidePanel` (Task 6).
- Produces:
  - `type CreditView = "tiles" | "new-rfq" | "sell-side"`
  - `CreditNav({ view, onChange }: { view: CreditView; onChange: (v: CreditView) => void })`
  - `CreditScreen()` — no props.

- [ ] **Step 1: Write the failing tests**

`CreditNav.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { CreditNav } from "#/ui/credit/CreditNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three sub-view tabs", async () => {
  await renderWithTheme(<CreditNav view="tiles" onChange={() => undefined} />);
  expect(screen.getByTestId("credit-tab-tiles")).toBeTruthy();
  expect(screen.getByTestId("credit-tab-new-rfq")).toBeTruthy();
  expect(screen.getByTestId("credit-tab-sell-side")).toBeTruthy();
});

test("pressing a tab reports the new view", async () => {
  const onChange = jest.fn<(v: string) => void>();
  await renderWithTheme(<CreditNav view="tiles" onChange={onChange} />);
  void fireEvent.press(screen.getByTestId("credit-tab-new-rfq"));
  expect(onChange).toHaveBeenCalledWith("new-rfq");
});
```

`CreditScreen.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Quote, Rfq } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { CreditScreen } from "#/ui/credit/CreditScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// A ViewModel covering every hook the three sub-views touch, all returning
// empty collections so each renders its empty/idle state.
function fakeViewModel(): ViewModel {
  return {
    useRfqs: () => {
      return [] as readonly Rfq[];
    },
    useInstruments: () => {
      return [];
    },
    useDealers: () => {
      return [];
    },
    useAcceptQuote: () => {
      return () => Promise.resolve();
    },
    useQuotesForRfq: () => {
      return [] as readonly Quote[];
    },
    useRfqCountdown: () => {
      return 0;
    },
    useRfqSubmission: () => {
      return { state: { status: "editing" }, submit: () => undefined };
    },
    useTicketSubmission: () => {
      return { state: { submitted: false }, submitPrice: () => undefined, pass: () => undefined };
    },
  } as unknown as ViewModel;
}

function renderScreen(): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel()}>
      <CreditScreen />
    </ViewModelProvider>,
  );
}

test("shows the RFQ tiles sub-view by default", async () => {
  await renderScreen();
  expect(screen.getByTestId("credit-tiles-panel")).toBeTruthy();
});

test("switching to New RFQ shows the create form", async () => {
  await renderScreen();
  void fireEvent.press(screen.getByTestId("credit-tab-new-rfq"));
  expect(screen.getByTestId("new-rfq-form")).toBeTruthy();
});

test("switching to Sell Side shows the sell-side panel", async () => {
  await renderScreen();
  void fireEvent.press(screen.getByTestId("credit-tab-sell-side"));
  expect(screen.getByTestId("sell-side-panel")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/CreditNav src/ui/credit/CreditScreen`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`CreditNav.tsx`:

```tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export type CreditView = "tiles" | "new-rfq" | "sell-side";

interface CreditTab {
  view: CreditView;
  label: string;
}

const TABS: readonly CreditTab[] = [
  { view: "tiles", label: "RFQ Tiles" },
  { view: "new-rfq", label: "New RFQ" },
  { view: "sell-side", label: "Sell Side" },
];

interface CreditNavProps {
  view: CreditView;
  onChange: (view: CreditView) => void;
}

export function CreditNav({ view, onChange }: CreditNavProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.nav} testID="credit-nav">
      {TABS.map((tab) => {
        const active = tab.view === view;
        return (
          <Pressable
            key={tab.view}
            testID={`credit-tab-${tab.view}`}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              onChange(tab.view);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface CreditNavStyles {
  nav: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): CreditNavStyles {
  return StyleSheet.create({
    nav: {
      flexDirection: "row",
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
    tabActive: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: t.accentPrimary,
    },
    label: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
    labelActive: { fontSize: 13, color: t.textPrimary, fontFamily: t.fontDisplay },
  });
}
```

`CreditScreen.tsx`:

```tsx
import type { JSX } from "react";
import { useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { CreditNav, type CreditView } from "#/ui/credit/CreditNav";
import { NewRfqForm } from "#/ui/credit/newRfq/NewRfqForm";
import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The Credit tab: a segmented control over three sub-views (RFQ Tiles / New
 * RFQ / Sell Side), mirroring the web `CreditWorkspace`. New-RFQ success snaps
 * back to the tiles view. Composition/toolbar/banner live one level up in
 * `_layout`. */
export function CreditScreen(): JSX.Element {
  const [view, setView] = useState<CreditView>("tiles");
  const styles = useThemedStyles(makeStyles);

  function handleCreated(): void {
    setView("tiles");
  }

  return (
    <View style={styles.screen} testID="credit-screen">
      <CreditNav view={view} onChange={setView} />
      {view === "tiles" ? <RfqTilesPanel /> : null}
      {view === "new-rfq" ? <NewRfqForm onCreated={handleCreated} /> : null}
      {view === "sell-side" ? <SellSidePanel /> : null}
    </View>
  );
}

interface CreditScreenStyles {
  screen: ViewStyle;
}

function makeStyles(t: RnTheme): CreditScreenStyles {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bgPrimary },
  });
}
```

Note: `handleCreated(): void` is assignable to `NewRfqForm`'s `onCreated: (rfqId: number) => void` (a zero-arg function satisfies a one-arg callback type in TS). It ignores the id and just returns to tiles, matching the web `handleRfqCreated`.

`app/credit.tsx`:

```tsx
import type { JSX } from "react";

import { CreditScreen } from "#/ui/credit/CreditScreen";

/** The Credit tab — RFQ Tiles, New RFQ and Sell Side. Composition, the
 * simulator toggle and the connection banner live one level up in `_layout`. */
export default function CreditRoute(): JSX.Element {
  return <CreditScreen />;
}
```

- [ ] **Step 4: Modify `app/_layout.tsx` — register the Credit tab**

In the `Chrome` component's `<Tabs>` block, add a `credit` screen between `analytics` and `appearance`:

```tsx
        <Tabs.Screen name="index" options={{ title: "Rates" }} />
        <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
        <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        <Tabs.Screen name="credit" options={{ title: "Credit" }} />
        <Tabs.Screen name="appearance" options={{ title: "Appearance" }} />
```

(Only the one new `<Tabs.Screen name="credit" ... />` line is added; leave everything else in `_layout.tsx` unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/credit/CreditNav src/ui/credit/CreditScreen`
Expected: PASS.

- [ ] **Step 6: Run the full gauntlet.** All exit 0. In particular `expo export` must succeed and the Credit tab must resolve (`app/credit.tsx` route present). Note the new module count for the phase record.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/src/ui/credit/CreditNav.tsx packages/client-react-native/src/ui/credit/CreditNav.test.tsx packages/client-react-native/src/ui/credit/CreditScreen.tsx packages/client-react-native/src/ui/credit/CreditScreen.test.tsx packages/client-react-native/app/credit.tsx packages/client-react-native/app/_layout.tsx
git commit -m "feat(rn): Credit tab — screen, sub-view nav, route + tab registration"
```

---

## Final whole-branch review

After Task 7, dispatch the final whole-branch code review (superpowers:requesting-code-review) on the most capable model, over the full branch diff (`git merge-base main HEAD`..`HEAD`). Focus areas:

- **Render purity / hook usage:** every leaf destructures `useViewModel()` (no chaining); no hook called conditionally; `RfqTileRow`/`SellSideRfqRow` per-row `useQuotesForRfq` subscriptions are stable.
- **Parity with web semantics:** dealer default-all + empty-override fallback; `canSubmit` gate; countdown only while Open; dismiss only when not Open; sell-side Adaptive-Bank filter; responded/closed labels.
- **jsdom-invisible paint bugs** (the opus review has caught these before): countdown fill width, warn colour threshold, disabled-button opacity, active-tab styling actually differ.
- **Pure View invariant:** `git diff --stat` touches ONLY `packages/client-react-native/**`; no neutral-layer or web files; no new deps in any `package.json`.
- Minor findings roll-up from the per-task reviews.

Then proceed to ship via the shipping-repo-changes flow (push branch → PR → CI green for HEAD sha → user-authorized merge → cleanup).

---

## Self-Review (author checklist — completed)

**1. Spec coverage:**
- RFQ Tiles buy-side (filter tabs, countdown, quotes, accept, dismiss) → Tasks 1–3. ✓
- New RFQ (instrument search, direction, quantity, dealer select, submit→confirm) → Tasks 4–5. ✓
- Sell Side (Adaptive-Bank panel, price/pass ticket) → Task 6. ✓
- 5th Credit tab + segmented sub-nav → Task 7. ✓
- Pure `rfqTileFilter` util + vitest → Task 1. ✓
- No new deps / no Modal / no Animated / no neutral changes → Global Constraints + final review. ✓

**2. Placeholder scan:** No TBD/TODO; every code step carries full code. ✓

**3. Type consistency:** `CreditView` defined in `CreditNav` (Task 7) and imported by `CreditScreen`; `RfqFilter`/`RFQ_FILTERS`/`filterRfqs` defined in Task 1 and consumed in Tasks 2–3; hook shapes match the ViewModel reference block; `onAccept`/`onDismiss`/`onSelect`/`onChange`/`onCreated` signatures consistent across producer and consumer tasks. ✓
