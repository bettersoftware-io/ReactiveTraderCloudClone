# Phase 3 — RN Execution + Blotter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trade execution (tap a SpotTile → bottom-sheet ticket → Buy/Sell) and a blotter tab to the RN client, reusing the existing `@rtc/client-core` execution/blotter machines unchanged.

**Architecture:** RN leaf components only — they consume `ViewModel` hooks (`usePrice`, `useNotional`, `useTileExecution`, `useTrades`) that already exist in `@rtc/react-bindings` (no react-dom). `AppRoot` lifts into `app/_layout.tsx` to wrap an `expo-router` `<Tabs>` navigator so both tabs (Rates | Blotter) share one composition. No new code under `packages/{domain,client-core,react-bindings}`, no new dependencies.

**Tech Stack:** React Native 0.83, Expo SDK 55, expo-router (`<Tabs>`), RN built-in `Modal`, RxJS-backed presenters via the ViewModel bridge, jest-expo + RNTL 14 for `.test.tsx`.

**Spec:** `docs/superpowers/specs/2026-07-01-phase3-rn-execution-blotter-design.md`

## Global Constraints

- **No new runtime code under `packages/{domain,client-core,react-bindings}`** — RN leaves + Expo Router wiring only. If a genuine gap in the neutral layer surfaces, STOP and escalate; do not add neutral code silently.
- **No new npm dependencies.** Use RN's built-in `Modal` and `expo-router`'s `Tabs` (already a dep at `^55.0.16`).
- **Expo-Go-pure:** no native modules needing a custom dev client (no reanimated / gesture-handler / `@gorhom/bottom-sheet`).
- **The live-WS execution path is not a CI gate.** The simulator branch must exercise the full execution + blotter flow with no `EXPO_PUBLIC_WS_TOKEN`.
- Node 26; **never** `node-linker=hoisted`. Biome zero findings, **no inline disables**.
- **Lint footguns (from Phases 1–2):** `arrow-body-style` wants braces, but Biome `useExplicitType` then wants a return type — write braces **and** an explicit return type, or use return-type-exempt inline callbacks; `no-restricted-syntax` bans inline object **param** types → use named prop interfaces; **do not use inline `style={{…}}` object literals** — mirror `SpotTile`'s `movementStyle` pattern (a `StyleSheet.create` map indexed by a key). The vitest node env needs explicit `import { expect, test } from "vitest"`; jest `.test.tsx` files import globals from `@jest/globals`.
- **The controller re-verifies every CI gate first-hand with real exit codes** — subagents under-run and misreport the gauntlet.

## Prerequisites (run once before Task 1)

The jest `moduleNameMapper` resolves `@rtc/*` to each package's built `dist/`. From the repo root of this worktree:

```bash
pnpm install
pnpm build
```

Expected: all packages build; `packages/{domain,client-core,react-bindings}/dist/index.js` exist. (These are unchanged this phase, but a fresh worktree needs them built for jest to resolve.)

## File Structure

**New files** (`packages/client-react-native/src/ui/`):
- `TradeRow.tsx` — one blotter row (pair, direction, notional, rate, status). Presentational.
- `TradeRow.test.tsx` — renders a `Trade`, asserts fields + status color mapping.
- `Blotter.tsx` — `FlatList` over `useTrades()` + empty state.
- `Blotter.test.tsx` — renders rows from a fake `useTrades()`; empty-state path.
- `TradeTicket.tsx` — the bottom-sheet ticket (RN `Modal`): price + notional `TextInput` + Sell/Buy + execution-state line + machine-driven auto-close.
- `TradeTicket.test.tsx` — execute-call args, disabled-on-error, status rendering, auto-close.

**Modified files:**
- `packages/client-react-native/src/ui/SpotTile.tsx` — wrap body in a `Pressable`; own `ticketVisible`; mount `<TradeTicket>` when open.
- `packages/client-react-native/src/ui/SpotTile.test.tsx` — add a press-opens-ticket test; extend the fake ViewModel.
- `packages/client-react-native/app/_layout.tsx` — becomes composition owner: `simulator` toggle + `<AppRoot>` wrapping `<Tabs>` + `<ConnectionBanner>`.
- `packages/client-react-native/app/index.tsx` — Rates screen: just `<TileGrid/>`.

**New route file:**
- `packages/client-react-native/app/blotter.tsx` — Blotter screen: just `<Blotter/>`.

---

### Task 1: Blotter list — `TradeRow` + `Blotter`

Two presentational leaves. `TradeRow` renders one `Trade`; `Blotter` maps `useTrades()` to a `FlatList` with an empty state. No nav needed — fully testable with a fake ViewModel.

**Files:**
- Create: `packages/client-react-native/src/ui/TradeRow.tsx`
- Create: `packages/client-react-native/src/ui/TradeRow.test.tsx`
- Create: `packages/client-react-native/src/ui/Blotter.tsx`
- Create: `packages/client-react-native/src/ui/Blotter.test.tsx`

**Interfaces:**
- Consumes (from `@rtc/domain`): `enum Direction { Buy="Buy", Sell="Sell" }`; `enum TradeStatus { Pending="Pending", Done="Done", Rejected="Rejected" }`; `interface Trade { tradeId:number; tradeName:string; currencyPair:string; notional:number; dealtCurrency:string; direction:Direction; spotRate:number; status:TradeStatus; tradeDate:string; valueDate:string }`.
- Consumes (from `@rtc/react-bindings`): `useViewModel()` → `ViewModel`; `ViewModel.useTrades: () => readonly Trade[]`; `ViewModelProvider`; `type ViewModel`.
- Produces: `TradeRow` (default-free named export, prop `{ trade: Trade }`); `Blotter` (named export, no props).

- [ ] **Step 1: Write the failing `TradeRow` test**

Create `packages/client-react-native/src/ui/TradeRow.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { TradeRow } from "#/ui/TradeRow";

const DONE_TRADE: Trade = {
  tradeId: 42,
  tradeName: "Trade 42",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.53818,
  status: TradeStatus.Done,
  tradeDate: "2026-07-01",
  valueDate: "2026-07-03",
};

test("renders pair, direction, notional, rate and status", async () => {
  await render(<TradeRow trade={DONE_TRADE} />);
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("Buy")).toBeTruthy();
  expect(screen.getByText("1,000,000")).toBeTruthy();
  expect(screen.getByText("1.53818")).toBeTruthy();
  expect(screen.getByText("Done")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/TradeRow.test.tsx`
Expected: FAIL — cannot find module `#/ui/TradeRow`.

- [ ] **Step 3: Implement `TradeRow`**

Create `packages/client-react-native/src/ui/TradeRow.tsx`:

```tsx
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type Trade, TradeStatus } from "@rtc/domain";

/** One executed-trade row. Status color mirrors SpotTile's `movementStyle`
 * pattern (a StyleSheet map indexed by the enum value) rather than an inline
 * style object, per the repo's inline-style ban. */
export function TradeRow({ trade }: TradeRowProps): JSX.Element {
  return (
    <View style={styles.row} testID={`trade-row-${trade.tradeId}`}>
      <Text style={styles.pair}>{trade.currencyPair}</Text>
      <Text>{trade.direction}</Text>
      <Text>{trade.notional.toLocaleString("en-US")}</Text>
      <Text>{trade.spotRate}</Text>
      <Text style={statusStyle[trade.status]}>{trade.status}</Text>
    </View>
  );
}

interface TradeRowProps {
  trade: Trade;
}

const statusStyle = StyleSheet.create({
  [TradeStatus.Pending]: { color: "#c8a13f" },
  [TradeStatus.Done]: { color: "#3fb68b" },
  [TradeStatus.Rejected]: { color: "#e05252" },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pair: { fontWeight: "600" },
});
```

- [ ] **Step 4: Run the `TradeRow` test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/TradeRow.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing `Blotter` test**

Create `packages/client-react-native/src/ui/Blotter.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { Blotter } from "#/ui/Blotter";

const TRADE: Trade = {
  tradeId: 7,
  tradeName: "Trade 7",
  currencyPair: "USDJPY",
  notional: 2_000_000,
  dealtCurrency: "USD",
  direction: Direction.Sell,
  spotRate: 110.25,
  status: TradeStatus.Done,
  tradeDate: "2026-07-01",
  valueDate: "2026-07-03",
};

function fakeViewModel(trades: readonly Trade[]): ViewModel {
  return { useTrades: () => trades } as unknown as ViewModel;
}

test("renders a row per trade", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel([TRADE])}>
      <Blotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("trade-row-7")).toBeTruthy();
  expect(screen.getByText("USDJPY")).toBeTruthy();
});

test("shows an empty state when there are no trades", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel([])}>
      <Blotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("blotter-empty")).toBeTruthy();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/Blotter.test.tsx`
Expected: FAIL — cannot find module `#/ui/Blotter`.

- [ ] **Step 7: Implement `Blotter`**

Create `packages/client-react-native/src/ui/Blotter.tsx`:

```tsx
import type { JSX } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  StyleSheet,
  Text,
} from "react-native";

import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { TradeRow } from "#/ui/TradeRow";

function keyExtractor(trade: Trade): string {
  return String(trade.tradeId);
}

function renderItem({ item }: ListRenderItemInfo<Trade>): JSX.Element {
  return <TradeRow trade={item} />;
}

/** The executed-trades blotter — a `FlatList` over the live `useTrades()`
 * stream from the ViewModel. Empty until the first trade executes (in both
 * simulator and live modes). */
export function Blotter(): JSX.Element {
  const { useTrades } = useViewModel();
  const trades = useTrades();

  if (trades.length === 0) {
    return (
      <Text style={styles.empty} testID="blotter-empty">
        No trades yet
      </Text>
    );
  }

  return (
    <FlatList
      testID="blotter-list"
      data={trades}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16, opacity: 0.6 },
});
```

- [ ] **Step 8: Run the `Blotter` test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/Blotter.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Verify typecheck + Biome**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm exec biome ci packages/client-react-native/src/ui/TradeRow.tsx packages/client-react-native/src/ui/TradeRow.test.tsx packages/client-react-native/src/ui/Blotter.tsx packages/client-react-native/src/ui/Blotter.test.tsx`
Expected: typecheck clean; Biome exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/client-react-native/src/ui/TradeRow.tsx packages/client-react-native/src/ui/TradeRow.test.tsx packages/client-react-native/src/ui/Blotter.tsx packages/client-react-native/src/ui/Blotter.test.tsx
git commit -m "feat(rn): blotter list — TradeRow + Blotter leaves off useTrades()"
```

---

### Task 2: `TradeTicket` bottom-sheet

The executable ticket. An RN `Modal` (transparent, slide) with a dimmed backdrop, showing the live price, a numeric notional `TextInput`, Sell/Buy buttons, and the execution-state line. Buy/Sell are disabled while the machine is busy or the notional is invalid. When the machine dismisses a terminal state back to `ready`, the ticket auto-closes — no UI-side timer.

**Files:**
- Create: `packages/client-react-native/src/ui/TradeTicket.tsx`
- Create: `packages/client-react-native/src/ui/TradeTicket.test.tsx`

**Interfaces:**
- Consumes (from `@rtc/domain`): `enum Direction`; `enum ExecutionStatus { Done, Rejected, Timeout, CreditExceeded }`; `interface CurrencyPair { symbol:string; ratePrecision:number; pipsPosition:number; base:string; terms:string; defaultNotional:number }`; `interface Price { symbol:string; bid:number; ask:number; mid:number; movementType; spread:string; … }`.
- Consumes (from `@rtc/client-core`): `type TileExecutionState = { status:"ready" } | { status:"started" } | { status:"tooLong" } | { status:"finished"; executionStatus:ExecutionStatus; trade?:Trade } | { status:"timeout" }`.
- Consumes (from `@rtc/react-bindings`): `useViewModel()`; `ViewModel.usePrice: (pair) => Price | null`; `ViewModel.useNotional: (defaultNotional:number) => { state:{ displayValue:string; numericValue:number; error:string|null; isRfq:boolean; isDefault:boolean }; change:(input:string)=>void; reset:()=>void }`; `ViewModel.useTileExecution: (pair) => { state:TileExecutionState; execute:(direction:Direction, price:Price, notional:number)=>void; dismiss:()=>void }`.
- Produces: `TradeTicket` (named export, props `{ pair: CurrencyPair; onClose: () => void }`).

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/src/ui/TradeTicket.test.tsx`:

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  type CurrencyPair,
  Direction,
  ExecutionStatus,
  type Price,
  PriceMovementType,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { TradeTicket } from "#/ui/TradeTicket";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
};

const PRICE: Price = {
  symbol: "EURUSD",
  bid: 1.53812,
  ask: 1.53818,
  mid: 1.53815,
  valueDate: "",
  creationTimestamp: 0,
  movementType: PriceMovementType.UP,
  spread: "0.6",
};

type ExecFn = (d: Direction, p: Price, n: number) => void;

// A fake ViewModel exposing the three hooks TradeTicket uses. `execState` and
// the notional `error` are parameters so a test can pin any machine state.
function fakeViewModel(opts: {
  execute: ExecFn;
  execState?: ReturnType<ViewModel["useTileExecution"]>["state"];
  error?: string | null;
}): ViewModel {
  const state = opts.execState ?? { status: "ready" as const };
  return {
    usePrice: () => PRICE,
    useNotional: () => ({
      state: {
        displayValue: "1,000,000",
        numericValue: 1_000_000,
        error: opts.error ?? null,
        isRfq: false,
        isDefault: true,
      },
      change: () => undefined,
      reset: () => undefined,
    }),
    useTileExecution: () => ({
      state,
      execute: opts.execute,
      dismiss: () => undefined,
    }),
  } as unknown as ViewModel;
}

test("tapping Buy executes with direction, price and notional", async () => {
  const execute = jest.fn<ExecFn>();
  await render(
    <ViewModelProvider viewModel={fakeViewModel({ execute })}>
      <TradeTicket pair={EURUSD} onClose={() => undefined} />
    </ViewModelProvider>,
  );
  fireEvent.press(screen.getByTestId("buy-btn"));
  expect(execute).toHaveBeenCalledWith(Direction.Buy, PRICE, 1_000_000);
});

test("Buy/Sell disabled when the notional has an error", async () => {
  const execute = jest.fn<ExecFn>();
  await render(
    <ViewModelProvider
      viewModel={fakeViewModel({ execute, error: "Too small" })}
    >
      <TradeTicket pair={EURUSD} onClose={() => undefined} />
    </ViewModelProvider>,
  );
  fireEvent.press(screen.getByTestId("buy-btn"));
  expect(execute).not.toHaveBeenCalled();
  expect(screen.getByTestId("notional-error")).toBeTruthy();
});

test("shows a Done confirmation when the machine finishes", async () => {
  await render(
    <ViewModelProvider
      viewModel={fakeViewModel({
        execute: () => undefined,
        execState: { status: "finished", executionStatus: ExecutionStatus.Done },
      })}
    >
      <TradeTicket pair={EURUSD} onClose={() => undefined} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("exec-status").props.children).toContain("Done");
});

test("auto-closes when a terminal state dismisses back to ready", async () => {
  const onClose = jest.fn<() => void>();
  const { rerender } = await render(
    <ViewModelProvider
      viewModel={fakeViewModel({
        execute: () => undefined,
        execState: { status: "finished", executionStatus: ExecutionStatus.Done },
      })}
    >
      <TradeTicket pair={EURUSD} onClose={onClose} />
    </ViewModelProvider>,
  );
  expect(onClose).not.toHaveBeenCalled();
  rerender(
    <ViewModelProvider
      viewModel={fakeViewModel({
        execute: () => undefined,
        execState: { status: "ready" },
      })}
    >
      <TradeTicket pair={EURUSD} onClose={onClose} />
    </ViewModelProvider>,
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/TradeTicket.test.tsx`
Expected: FAIL — cannot find module `#/ui/TradeTicket`.

- [ ] **Step 3: Implement `TradeTicket`**

Create `packages/client-react-native/src/ui/TradeTicket.tsx`:

```tsx
import type { JSX } from "react";
import { useEffect, useRef } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { type CurrencyPair, Direction, ExecutionStatus } from "@rtc/domain";
import type { TileExecutionState } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

/** The bottom-sheet trade ticket. Mounted only while open (SpotTile gates it),
 * so the execution/notional subscriptions live for exactly the open window.
 * Built on RN's built-in `Modal` — no bottom-sheet dependency — with a dimmed
 * backdrop that dismisses on press.
 *
 * Auto-close is machine-driven, not timer-driven: `TileExecutionMachine`
 * appends its own auto-dismiss timer to terminal states (finished/timeout) and
 * returns to `ready`. We record that a terminal state was seen, then close when
 * the machine dismisses back to `ready` — no UI-side timer, no magic number. */
export function TradeTicket({ pair, onClose }: TradeTicketProps): JSX.Element {
  const { usePrice, useNotional, useTileExecution } = useViewModel();
  const price = usePrice(pair);
  const notional = useNotional(pair.defaultNotional);
  const execution = useTileExecution(pair);

  const status = execution.state.status;
  const isBusy = status === "started" || status === "tooLong";
  const hasError = notional.state.error !== null;
  const canExecute = price !== null && !isBusy && !hasError;

  const settled = useRef(false);
  useEffect(() => {
    if (status === "finished" || status === "timeout") {
      settled.current = true;
    } else if (status === "ready" && settled.current) {
      onClose();
    }
  }, [status, onClose]);

  const onSide = (direction: Direction): void => {
    if (price === null) {
      return;
    }
    execution.execute(direction, price, notional.state.numericValue);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID="ticket-backdrop"
      />
      <View style={styles.sheet} testID="trade-ticket">
        <Text style={styles.pair}>{pair.symbol}</Text>
        <Text style={styles.price}>
          {price === null ? "—" : `${price.bid} / ${price.ask}`}
        </Text>
        <TextInput
          testID="notional-input"
          keyboardType="numeric"
          value={notional.state.displayValue}
          onChangeText={notional.change}
          style={styles.input}
        />
        {hasError ? (
          <Text style={styles.error} testID="notional-error">
            {notional.state.error}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Pressable
            testID="sell-btn"
            disabled={!canExecute}
            onPress={() => onSide(Direction.Sell)}
            style={canExecute ? styles.sell : styles.disabled}
          >
            <Text>Sell</Text>
          </Pressable>
          <Pressable
            testID="buy-btn"
            disabled={!canExecute}
            onPress={() => onSide(Direction.Buy)}
            style={canExecute ? styles.buy : styles.disabled}
          >
            <Text>Buy</Text>
          </Pressable>
        </View>
        <Text testID="exec-status">{statusLabel(execution.state)}</Text>
      </View>
    </Modal>
  );
}

interface TradeTicketProps {
  pair: CurrencyPair;
  onClose: () => void;
}

/** Human-readable line for each execution state (mirrors the web tile's
 * overlay semantics). */
function statusLabel(state: TileExecutionState): string {
  switch (state.status) {
    case "ready":
      return "";
    case "started":
      return "Executing…";
    case "tooLong":
      return "Still working…";
    case "timeout":
      return "Timed out";
    case "finished":
      return state.executionStatus === ExecutionStatus.Done
        ? `Done — ${state.trade?.tradeName ?? "trade booked"}`
        : state.executionStatus;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    gap: 12,
  },
  pair: { fontSize: 18, fontWeight: "600" },
  price: { fontSize: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 6,
    padding: 10,
  },
  error: { color: "#e05252" },
  buttons: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  sell: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 6,
    backgroundColor: "#f2c0c0",
  },
  buy: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 6,
    backgroundColor: "#bfe6d5",
  },
  disabled: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 6,
    backgroundColor: "#e6e6e6",
    opacity: 0.5,
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/TradeTicket.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify typecheck + Biome**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm exec biome ci packages/client-react-native/src/ui/TradeTicket.tsx packages/client-react-native/src/ui/TradeTicket.test.tsx`
Expected: typecheck clean; Biome exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/TradeTicket.tsx packages/client-react-native/src/ui/TradeTicket.test.tsx
git commit -m "feat(rn): TradeTicket bottom-sheet — notional + Buy/Sell off the execution machine"
```

---

### Task 3: Make `SpotTile` open the ticket

Wrap the existing tile body in a `Pressable`; hold a `ticketVisible` boolean; mount `<TradeTicket>` only while open (so its hooks/subscriptions live for the open window only). Existing price rendering is unchanged.

**Files:**
- Modify: `packages/client-react-native/src/ui/SpotTile.tsx`
- Modify: `packages/client-react-native/src/ui/SpotTile.test.tsx`

**Interfaces:**
- Consumes: `TradeTicket` (Task 2) — `{ pair: CurrencyPair; onClose: () => void }`.
- Produces: unchanged `SpotTile` export, prop `{ pair: CurrencyPair }`; adds `testID="spot-tile"` on the pressable wrapper.

- [ ] **Step 1: Add the failing press test**

Add to `packages/client-react-native/src/ui/SpotTile.test.tsx`. First extend the existing `fakeViewModel` helper so it also answers the ticket's hooks, then add the test. Replace the existing `fakeViewModel` function at the bottom of the file with:

```tsx
function fakeViewModel(price: Price | null): ViewModel {
  return {
    usePrice: () => price,
    useNotional: () => ({
      state: {
        displayValue: "1,000,000",
        numericValue: 1_000_000,
        error: null,
        isRfq: false,
        isDefault: true,
      },
      change: () => undefined,
      reset: () => undefined,
    }),
    useTileExecution: () => ({
      state: { status: "ready" as const },
      execute: () => undefined,
      dismiss: () => undefined,
    }),
  } as unknown as ViewModel;
}
```

Add these imports to the top of the file (alongside the existing ones):

```tsx
import { fireEvent } from "@testing-library/react-native";
```

Add the test:

```tsx
test("pressing the tile opens the trade ticket", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel(UP_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("trade-ticket")).toBeNull();
  fireEvent.press(screen.getByTestId("spot-tile"));
  expect(screen.getByTestId("trade-ticket")).toBeTruthy();
});
```

> Note: `fireEvent` may be merged into the existing `{ render, screen }` import from `@testing-library/react-native` instead of a second import line — either is fine as long as Biome passes.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/SpotTile.test.tsx`
Expected: FAIL — no `testID="spot-tile"` element / ticket never appears.

- [ ] **Step 3: Update `SpotTile`**

Edit `packages/client-react-native/src/ui/SpotTile.tsx`. Add imports, a `useState`, wrap the returned tree in a `Pressable`, and mount the ticket. The full file:

```tsx
import type { JSX } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { splitPrice } from "#/ui/formatPrice";
import { TradeTicket } from "#/ui/TradeTicket";

export function SpotTile({ pair }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  const [ticketVisible, setTicketVisible] = useState(false);

  const body =
    price === null ? (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    ) : (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <View style={styles.row}>
          <Text>{splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition).prefix}</Text>
          <Text style={movementStyle[price.movementType]}>
            {splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition).pips}
          </Text>
          <Text>{splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition).fractional}</Text>
        </View>
        <Text style={styles.spread}>{price.spread}</Text>
        <Text style={styles.hidden} testID="spot-tile-movement">
          {price.movementType}
        </Text>
      </View>
    );

  return (
    <>
      <Pressable testID="spot-tile" onPress={() => setTicketVisible(true)}>
        {body}
      </Pressable>
      {ticketVisible ? (
        <TradeTicket pair={pair} onClose={() => setTicketVisible(false)} />
      ) : null}
    </>
  );
}

interface SpotTileProps {
  pair: CurrencyPair;
}

const movementStyle = StyleSheet.create({
  NONE: { color: "#c8c8c8" },
  UP: { color: "#3fb68b" },
  DOWN: { color: "#e05252" },
});

const styles = StyleSheet.create({
  container: { padding: 12 },
  symbol: { fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row" },
  spread: { fontSize: 11, opacity: 0.6 },
  loading: { fontSize: 12, opacity: 0.5 },
  hidden: { display: "none" },
});
```

> The `splitPrice(...)` call is repeated inline three times above only to keep the render tree flat; if the implementer prefers, compute `const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);` once above the JSX (as the original did) and reference `ask.prefix`/`ask.pips`/`ask.fractional`. Either is acceptable — keep whichever passes Biome cleanly (avoid an unused-var or shadow warning).

- [ ] **Step 4: Run the full RN test suite to verify green**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/SpotTile.test.tsx`
Expected: PASS (3 tests — the original 2 plus the press test).

- [ ] **Step 5: Verify typecheck + Biome**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm exec biome ci packages/client-react-native/src/ui/SpotTile.tsx packages/client-react-native/src/ui/SpotTile.test.tsx`
Expected: typecheck clean; Biome exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/SpotTile.tsx packages/client-react-native/src/ui/SpotTile.test.tsx
git commit -m "feat(rn): SpotTile opens the TradeTicket on press"
```

---

### Task 4: Navigation — lift `AppRoot`, add Rates | Blotter tabs

Restructure the router so `AppRoot` wraps a `<Tabs>` navigator: both tabs share one composition (one WS connection, one blotter). The `simulator` toggle and its `key`-remount move up to `app/_layout.tsx`. This task is verified by the `expo export` smoke (the app bundles and the route tree is valid) plus the full gauntlet — route files carry no unit tests (jest matches only `**/*.test.tsx` under `src/`).

**Files:**
- Modify: `packages/client-react-native/app/_layout.tsx`
- Modify: `packages/client-react-native/app/index.tsx`
- Create: `packages/client-react-native/app/blotter.tsx`

**Interfaces:**
- Consumes: `AppRoot` (`{ simulator: boolean; children: ReactNode }`, unchanged); `ConnectionBanner` (no props); `TileGrid` (no props); `Blotter` (Task 1, no props); `Tabs` from `expo-router`.
- Produces: three routes under the `./app` router root — `_layout` (tabs shell), `index` (Rates), `blotter` (Blotter).

- [ ] **Step 1: Capture the current export baseline**

Run: `pnpm --filter @rtc/client-react-native export`
Expected: PASS — `expo export` completes and prints a bundle summary (note the module count; Phase 2's real-stack bundle was ~1581 modules). This is the pre-change baseline.

- [ ] **Step 2: Rewrite `app/_layout.tsx` as the composition owner**

Replace the entire contents of `packages/client-react-native/app/_layout.tsx`:

```tsx
import { Tabs } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Switch, Text, View } from "react-native";

import { AppRoot } from "#/app/AppRoot";
import { ConnectionBanner } from "#/ui/ConnectionBanner";

/** Root layout: owns the simulator/live toggle and wraps the whole tab
 * navigator in a single `AppRoot` so both tabs (Rates | Blotter) share one
 * composition — one WS connection, one blotter presenter. Flipping the toggle
 * re-mounts `AppRoot` via the `key`, rebuilding the composition against the
 * newly selected branch (moved up one level from Phase 2's index screen). */
export default function RootLayout(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.toolbar}>
        <Text>Simulator</Text>
        <Switch value={simulator} onValueChange={setSimulator} />
      </View>
      <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
        <ConnectionBanner />
        <Tabs screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="index" options={{ title: "Rates" }} />
          <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
        </Tabs>
      </AppRoot>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
```

- [ ] **Step 3: Reduce `app/index.tsx` to the Rates screen**

Replace the entire contents of `packages/client-react-native/app/index.tsx`:

```tsx
import type { JSX } from "react";

import { TileGrid } from "#/ui/TileGrid";

/** The Rates tab — the live FX spot-tile grid. Composition, the simulator
 * toggle and the connection banner now live one level up in `_layout`. */
export default function RatesScreen(): JSX.Element {
  return <TileGrid />;
}
```

- [ ] **Step 4: Create the Blotter route**

Create `packages/client-react-native/app/blotter.tsx`:

```tsx
import type { JSX } from "react";

import { Blotter } from "#/ui/Blotter";

/** The Blotter tab — executed-trades history. */
export default function BlotterScreen(): JSX.Element {
  return <Blotter />;
}
```

- [ ] **Step 5: Verify typecheck + Biome on the route files**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm exec biome ci packages/client-react-native/app/_layout.tsx packages/client-react-native/app/index.tsx packages/client-react-native/app/blotter.tsx`
Expected: typecheck clean; Biome exit 0 (default exports are allowed under `app/**` by the scoped Biome config).

- [ ] **Step 6: Verify the app still bundles (export smoke)**

Run: `pnpm --filter @rtc/client-react-native export`
Expected: PASS — `expo export` completes; the module count is ≥ the Step 1 baseline (the new leaves add modules). A green export proves the route tree (`_layout` → Tabs → `index`/`blotter`) resolves and the ViewModel provider wraps both tabs.

- [ ] **Step 7: Run the full RN package test suite**

Run: `pnpm --filter @rtc/client-react-native test`
Expected: PASS — vitest node tests + all jest `.test.tsx` (SpotTile 3, TradeRow 1, Blotter 2, TradeTicket 4, plus the existing Phase 2 suites) green.

- [ ] **Step 8: Commit**

```bash
git add packages/client-react-native/app/_layout.tsx packages/client-react-native/app/index.tsx packages/client-react-native/app/blotter.tsx
git commit -m "feat(rn): Rates | Blotter tabs — lift AppRoot to _layout, share one composition"
```

---

## Final verification (before the whole-branch review + finishing)

Run the full gauntlet from the worktree root with real exit codes (the controller does this first-hand — do not trust a subagent's summary):

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm exec biome ci packages tests
pnpm --filter @rtc/client-react-native export
# CI-only gates that the local loop misses (per the RN workstream lessons):
pnpm lint:eslint
pnpm lint:eslint:types
pnpm lint:dead        # knip — the new leaves must be reachable from a route
pnpm check:deps       # dependency-cruiser — no app→app or inward-violating imports
pnpm check:versions   # syncpack
```

Expected: every command exit 0. Notes:
- **knip:** the new leaves are reachable (`Blotter` ← `app/blotter.tsx`; `TradeTicket` ← `SpotTile` ← `TileGrid` ← `app/index.tsx`; `TradeRow` ← `Blotter`), so none should be reported unused. If knip flags a leaf as unused, its route wiring is missing — fix the wiring, do not add a knip ignore.
- **check:deps:** all new imports flow inward (`@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`) — no app-to-app imports.
- The live-WS smoke (`smoke:ws`) is **not** run here — it needs a token and is not a gate.

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Bottom-sheet ticket (notional + Buy/Sell) → Task 2. ✅
- Second nav tab (Rates | Blotter) → Task 4. ✅
- Lift `AppRoot` to share one composition → Task 4. ✅
- Pressable SpotTile opens ticket → Task 3. ✅
- Blotter `FlatList` + `TradeRow` → Task 1. ✅
- Reuse `usePrice`/`useNotional`/`useTileExecution`/`useTrades`; no neutral-layer code → all tasks consume hooks only; no `packages/{domain,client-core,react-bindings}` edits. ✅
- Execution-state rendering + machine-driven auto-dismiss → Task 2 (`statusLabel` + the `settled` effect). ✅
- Error handling (rejected/invalid notional/timeout) → Task 2 (`statusLabel` timeout/rejected + `hasError` disables). ✅
- jest-expo island tests reusing the fake-ViewModel harness → every task. ✅
- No new deps / Expo-Go-pure (RN `Modal`, `expo-router` `Tabs`) → Task 2, Task 4. ✅
- Non-goals (RFQ, charts, analytics, theming, CSV, sort/filter, row-highlight, NetInfo) → none appear in any task. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; every run step shows the command + expected result.

**3. Type consistency:** `execute(direction, price, notional)` matches `TileExecutionIntents`; `TileExecutionState` variants used in `statusLabel` match the union; `NotionalView` fields (`displayValue`/`numericValue`/`error`) match usage; `Trade` fields in `TradeRow`/tests match the entity; `Direction`/`TradeStatus`/`ExecutionStatus` enum values match the domain source.
