# Phase 3 — RN Client: Trade Execution + Blotter (Design)

**Status:** Approved (2026-07-01)
**Workstream:** RN/Expo client (`@rtc/client-react-native`)
**Predecessors:** Phase 0 (client-core extraction, PR #56) · Phase 1 (Expo scaffold, PR #61) · Phase 2 (walking skeleton, PR #69)
**Roadmap source:** `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md` §4 — *"Phase 3+ … execution + blotter → analytics/P&L → theming → …"*

## Goal

Turn the read-only Phase 2 spot-tile grid into an executable trading surface: tap a
live `SpotTile` → a bottom-sheet ticket → set notional → **Buy/Sell** → the trade
executes against the deployed Fly server (or the in-app simulator) → a confirmation
shows → the executed trade appears in a **Blotter** tab. The entire execution +
blotter machine layer already exists and is test-covered in the neutral packages;
this phase adds only React Native leaves that consume it.

## The thesis this phase proves

The architectural bet of the whole RN workstream is that **presenters and machines
port to a second platform unchanged** — only the leaf components differ. Phase 3 is
the sharpest test of that bet yet: the FX execution state machine
(`executing → tooLong → timeout → confirmed/rejected → auto-dismiss`) and the blotter
projection are reused **byte-for-byte** from `@rtc/client-core`, with **zero new code
under `packages/{domain,client-core,react-bindings}`**.

## Reuse surface (already built, already green)

Confirmed present on `origin/main`:

- **domain:** `ExecuteTradeUseCase`, `TradeBlotterUseCase`, `executionPort`, `blotterPort`,
  `ExecutionSimulator`, `TradeStoreSimulator` (+ contract tests).
- **client-core presenters/machines:** `TileExecutionMachine`, `NotionalMachine`,
  `TradeExecutionPresenter`, `BlotterPresenter` (+ `__tests__`), and the transport
  adapters `wsRealExecution` / `wsRealBlotter` (+ contract/error tests).
- **server:** `rpc.executeTrade` → `rpc.executeTrade.response` and
  `subscribe.blotter` → `stream.blotter` (in `wsHandler.ts` / `protocol.ts`) — the
  deployed Fly server already answers execution and streams the blotter.
- **`buildNativePorts`** already spreads the full `createWsRealPorts` /
  `createSimulatorPorts`, so `AppPorts.execution` and `AppPorts.blotter` are **already
  wired on the native side** — no port wiring changes needed.

**ViewModel hooks the leaves consume** (in `@rtc/react-bindings`, which has **no
react-dom** — shared with RN):

| Hook | Shape | Use |
| --- | --- | --- |
| `usePrice(pair)` | `Price \| null` | live price shown in the ticket + passed to `execute` |
| `useNotional(pair.defaultNotional)` | `{ state: NotionalView } & NotionalIntents` | notional input + validation |
| `useTileExecution(pair)` | `{ state: TileExecutionState } & { execute(dir, price, notional): void }` | Buy/Sell + execution state |
| `useTrades()` | `readonly Trade[]` | blotter list |

## Why both modes give an end-to-end demo

Executing a trade lands it in the blotter in **both** branches, with no extra wiring:

- **Simulator:** `buildNativePorts` builds `blotter: new TradeStoreSimulator(execution)`
  from the *same* `ExecutionSimulator` the execution port uses, so an executed trade
  flows into the blotter stream in-process.
- **Live:** the Fly server pushes the new trade on `stream.blotter` after
  `rpc.executeTrade` resolves.

Either way, executing on the Rates tab makes a row appear on the Blotter tab.

## Structural change: navigation (the one non-trivial piece)

Phase 2's `app/index.tsx` owns both the `simulator` toggle **and** wraps `AppRoot`
around the grid. For two tabs to share **one** composition — one WS connection, one
blotter presenter, not two — `AppRoot` must move **up** to the router layout so it
wraps the whole tab navigator.

**Before (Phase 2):**
```
app/_layout.tsx   → <Stack>
app/index.tsx     → simulator state + <AppRoot key={…}> ConnectionBanner + TileGrid </AppRoot>
```

**After (Phase 3):**
```
app/_layout.tsx   → simulator state + toggle
                    <AppRoot key={sim?"sim":"live"} simulator={sim}>
                      <ConnectionBanner/>
                      <Tabs>  (Rates | Blotter)
                    </AppRoot>
app/index.tsx     → Rates tab  → <TileGrid/>          (tiles now pressable)
app/blotter.tsx   → Blotter tab → <Blotter/>
```

- The `simulator` toggle and its `key`-remount semantics (rebuild the whole
  composition on flip) are preserved — they simply live in `_layout` now, one level
  above the tabs, so a flip still remounts the shared composition.
- `<ConnectionBanner/>` renders once, above the tabs, so both tabs see connection
  state.
- `app.config.ts` `extra.router.root: "./app"` is unchanged; `expo-router` is already
  a dependency; `<Tabs>` comes from `expo-router` (no new dependency).

## New / changed RN leaves (`packages/client-react-native/src/ui/`)

- **`SpotTile.tsx`** *(modify)* — wrap the tile body in `Pressable`; own a
  `ticketVisible` boolean; render `<TradeTicket pair={pair} visible={…}
  onClose={…}/>` inside an RN `Modal`. Read-only price rendering is unchanged from
  Phase 2.

- **`TradeTicket.tsx`** *(new)* — the bottom-sheet ticket, built on React Native's
  **built-in `Modal`** (`transparent`, `animationType="slide"`, content pinned to the
  bottom with a dimmed backdrop). **No `@gorhom/bottom-sheet` / reanimated /
  gesture-handler** — dependency-free keeps it Expo-Go-pure and avoids new native
  modules. Contents:
  - pair label + live price (`usePrice(pair)`);
  - a numeric notional `TextInput` (`keyboardType="numeric"`) driven by
    `useNotional(pair.defaultNotional)` — formatted value, change/reset intents,
    error surfaced;
  - **Sell** and **Buy** buttons calling
    `useTileExecution(pair).execute(direction, price, notional)`;
  - execution-state rendering from `useTileExecution(pair).state`: buttons disabled
    while `executing`/`tooLong` or when notional is invalid (mirrors web's
    `notionalDisabled` / `hasError`); an inline confirmation/rejection line for the
    terminal states;
  - **auto-dismiss:** the machine already appends the auto-dismiss timer to terminal
    states; when state returns to `ready`/dismisses, the ticket closes.

- **`Blotter.tsx`** *(new)* — a `FlatList` over `useTrades()`, empty-state text when
  there are no trades yet.

- **`TradeRow.tsx`** *(new)* — one blotter row: currency pair, direction
  (Buy/Sell), notional, rate, status, trade date — mirroring the fields of web's
  `BlotterRow` but as RN `Text`/`View`.

## Testing (jest-expo island — same split as Phase 2)

`.test.tsx` → jest-expo/RNTL 14 (async `render`, `@jest/globals`);
`.test.ts` → vitest node. New tests, all against the **fake ViewModel harness**
established in Phase 2 (no live server, no neutral-layer re-testing):

- **`TradeTicket.test.tsx`** — open the ticket; type a notional; tap **Buy** →
  assert `execute` was called with `(Direction.Buy, <price>, <notional>)`; drive the
  fake `useTileExecution` state through `executing` → `confirmed` and assert the
  rendered confirmation; assert auto-dismiss closes the sheet; assert Buy/Sell are
  disabled when the fake notional carries an error.
- **`Blotter.test.tsx`** — render rows from a fake `useTrades()`; assert fields and
  the empty state.
- **`SpotTile.test.tsx`** *(update)* — pressing the tile opens the ticket.

No new tests under `packages/{domain,client-core,react-bindings}` — those machines
are already covered. The CI `expo export` real-stack smoke asserts the bundle still
builds; its module count ticks up.

## Error handling (all reused)

- **Execution rejected** → machine `rejected` state → ticket shows "Rejected" →
  auto-dismiss.
- **Invalid / zero notional** → `useNotional` error → Buy/Sell disabled (no execute
  is dispatched).
- **Disconnected mid-execute** → `ConnectionBanner` already reflects the gateway
  state; an execute attempt with no server response resolves via the machine's
  `timeout` state → "Timed out" → auto-dismiss.

## Global constraints (inherited — copy verbatim into the plan)

- **No new runtime code under `packages/{domain,client-core,react-bindings}`.** Phase
  3 is RN leaves + Expo Router wiring only. (If a genuine gap in the neutral layer is
  discovered, stop and escalate — do not add it silently.)
- **No new npm dependencies.** Use RN's built-in `Modal` and `expo-router`'s `Tabs`.
- **Expo-Go-pure:** no native modules requiring a custom dev client
  (no reanimated/gesture-handler/bottom-sheet).
- **The live-WS execution path is not a CI gate** (needs `EXPO_PUBLIC_WS_TOKEN`,
  which is the user's manual setup). The simulator branch must exercise the full
  execution + blotter flow with no token.
- Node 26; **never** `node-linker=hoisted`. Biome zero findings, no inline disables.
  Full 12-gate CI gauntlet must pass; the controller re-verifies each gate with real
  exit codes (subagents under-run and misreport — see the RN workstream lesson).
- RN gate footguns (from Phases 1–2): `arrow-body-style` wants braces but Biome
  `useExplicitType` then wants a return type; `no-restricted-syntax` bans inline
  object param types → use named RN types; vitest node env needs explicit
  `resolve.alias` for `#/` + explicit `import { expect, test } from "vitest"`.

## Non-goals (explicitly deferred to later phases)

RFQ / large-size quote flow; price charts (`TileChart`); analytics / P&L; theming
(skin × mode); shell chrome (boot / lock); credit; equities; CSV export; blotter
column sort / filter / quick-filter; blotter row-highlight flash animation; a NetInfo
adapter; the renderer-neutral contract-test tier (still DOM-coupled).

## Phasing note

This phase is independently mergeable and ends in a publishable EAS Update — the
first colleague-demoable **trading** build. The user's manual EAS + `EXPO_PUBLIC_WS_TOKEN`
steps (documented in `packages/client-react-native/README.md`) remain their job for
the live path; the simulator toggle demos execution + blotter with no setup.
