# Jarvis Phase 1 — Scripted Core Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v5 prototype's fake J.A.R.V.I.S core surface (header orb, cinematic overlay, scripted desk intelligence, confirm-gated FX execution) to `client-react` + `client-solid` on real seams: `JarvisMachine` + `JarvisPort` in client-core, a client-side `ScriptedJarvisAdapter`, dumb UI in both clients.

**Architecture:** The scripted brain is a `JarvisPort` adapter constructed inside `portFactory.ts` (both simulator and ws-real branches — zero client composition-root changes, works in all four dev modes). The machine folds per-turn `JarvisEvent` streams (delta/toolEvent/confirmRequest/done/error — the exact shapes P2's `JARVIS_*` wire messages will carry). The typed-out reveal is adapter-side chunked delta emission (pure chunk math in `@rtc/motion-core`, rxjs timing in the adapter) — NOT a view-layer rAF shell; grep-gate 29 bans UI timers and this keeps reveal fully TestScheduler-deterministic.

**Tech Stack:** rxjs + @rx-state/core (client-core), React 19 / SolidJS (dumb UI), CSS Modules, vitest + TestScheduler, @rtc/ui-contract swap-trio, Playwright.

**Spec:** [../specs/2026-07-26-jarvis-phase-1-scripted-surface-design.md](../specs/2026-07-26-jarvis-phase-1-scripted-surface-design.md) (parent: [../specs/2026-07-12-jarvis-ai-assistant-design.md](../specs/2026-07-12-jarvis-ai-assistant-design.md))

## Global Constraints

- `@rtc/domain` gains ONLY the `JarvisSkin` preference (type + port methods) — no Jarvis domain logic. `@rtc/server` untouched.
- No new package. `@rtc/agent-tools` is phase 3.
- Dumb UI: no rxjs/localStorage/fetch/`import.meta.env`/`setTimeout`/`setInterval` in `src/ui` (grep gates 26–29 React, 34–37 Solid). No inline `style={{…}}` (ESLint).
- Perf (docs/performance.md is binding): animate `transform`/`opacity` only; no animated `filter`/`box-shadow`/`backdrop-filter`; no `var()` inside animated transforms; one animation per property per element; idle motion uses `animation-play-state: var(--fx-play, running)` + `@media (prefers-reduced-motion: reduce) { animation: none }`; Freeze is handled by the `index.css` catch-all automatically.
- Overlay desk dim = static semi-opaque layer (`rgba(0,0,0,0.62)` like PreferencesModal) — **no `backdrop-filter`**.
- Persisted preference key: `rtc-jarvis-skin` (new keys use the `rtc-` prefix).
- Machine contract: `Machine<TState, TIntents>` from `#/presenters/machine`; `state$` must stay warm (internal subscribe torn down in `dispose()`), per the contract docblock.
- Singleton-machine binding: React reads via `useStateObservable(presenters.jarvis.state$)` (the eqWorkspace pattern — **never** `bind()`, which has a first-render-default bug for singletons); Solid via `toSignal`.
- Copy register: capable, calm, slightly wry, addresses the user as "sir"; no trademarked lines.
- Timeout: `JARVIS_CONFIRM_TIMEOUT_MS = 60_000`.
- Commit after every task; run the named test commands before each commit.

## File Structure (locked)

```
packages/domain/src/preferences/preferences.ts        JarvisSkin type + consts (Task 1)
packages/motion-core/src/speechChunks.ts              pure reveal-chunk math (Task 2)
packages/client-core/src/adapters/jarvisPort.ts       JarvisPort + JarvisEvent (Task 3)
packages/client-core/src/presenters/JarvisMachine.ts  createJarvisMachine (Task 3)
packages/client-core/src/adapters/jarvisIntent.ts     pure intent matcher (Task 4)
packages/client-core/src/adapters/ScriptedJarvisAdapter.ts  the brain (Task 4)
packages/client-core/src/adapters/portFactory.ts      AppPorts.jarvis wiring (Task 5)
packages/client-core/src/composition.ts               Presenters.jarvis (Task 5)
packages/{react,solid}-bindings/src/createViewModel.ts  useJarvis (Task 6)
packages/client-react/src/ui/shell/jarvis/            JarvisOrb, JarvisOverlay,
                                                      JarvisConfirmCard, useJarvisHotkey (Task 7)
packages/client-solid/src/ui/shell/jarvis/            Solid twins (Task 8)
packages/ui-contract/src/…                            world fake port, tokens, pages, specs (Task 9)
packages/ui-contract/src/visual/…                     fixtures + scenarios (Task 10)
tests/browser/…                                       Jarvis PO + e2e smoke (Task 11)
```

---

### Task 1: `JarvisSkin` preference in `@rtc/domain` + all adapters

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts`
- Modify: `packages/domain/src/index.ts` (Preferences block)
- Modify: `packages/domain/src/ports/preferencesPort.ts`
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts`
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`
- Test wiring: `packages/client-react/src/app/adapters/preferences.contract.test.ts`, `packages/client-solid/src/app/adapters/preferences.contract.test.ts`, `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts`

**Interfaces:**
- Produces: `type JarvisSkin = "singularity" | "reactor"`, `DEFAULT_JARVIS_SKIN: JarvisSkin = "singularity"`, `JARVIS_SKINS: readonly JarvisSkin[]`, `PreferencesPort.jarvisSkin$(): Observable<JarvisSkin>`, `PreferencesPort.setJarvisSkin(skin: JarvisSkin): void`, `PreferencesSeed.jarvisSkin?: JarvisSkin`, storage key `JARVIS_SKIN_STORAGE_KEY = "rtc-jarvis-skin"`.

Follow the `AmbientStyle` exemplar cell-for-cell (it is the documented ~15-site blast radius; the census with exact line numbers is in the spec's recon: domain type L-block, port docblock "replay-current, emits synchronously on subscribe", `BehaviorSubject`-backed adapters, `isJarvisSkin` guard validating against `JARVIS_SKINS`, `readStored`/`writeStored` helpers, `distinctUntilChanged()` on the stream).

- [ ] **Step 1: Write the failing contract tests.** In `PreferencesPortContract.ts`, mirror the three `ambientStyle` `it()`s:

```ts
it("jarvisSkin$ replays the current skin synchronously on subscribe", () => {
  const port = build({ jarvisSkin: "reactor" });
  let seen: JarvisSkin | undefined;
  port.jarvisSkin$().subscribe((s) => { seen = s; }).unsubscribe();
  expect(seen).toBe("reactor");
});

it("setJarvisSkin pushes the new value to subscribers", () => {
  const port = build({});
  const seen: JarvisSkin[] = [];
  const sub = port.jarvisSkin$().subscribe((s) => { seen.push(s); });
  port.setJarvisSkin("reactor");
  sub.unsubscribe();
  expect(seen).toEqual(["singularity", "reactor"]);
});

it("defaults to singularity when nothing is stored", () => {
  const port = build({});
  let seen: JarvisSkin | undefined;
  port.jarvisSkin$().subscribe((s) => { seen = s; }).unsubscribe();
  expect(seen).toBe(DEFAULT_JARVIS_SKIN);
});
```

Add `jarvisSkin?: JarvisSkin` to `PreferencesSeed`. In each of the three per-client contract test files, extend the seed branch the same way `ambientStyle` is seeded, and add the "falls back to defaults for an invalid stored jarvisSkin" case mirroring the ambientStyle one.

- [ ] **Step 2: Run to verify failure.** `pnpm --filter @rtc/domain test` → FAIL (port methods missing).
- [ ] **Step 3: Implement.** `preferences.ts`:

```ts
/** J.A.R.V.I.S orb/overlay visual core. Rendered in order by the skin switch. */
export type JarvisSkin = "singularity" | "reactor";
export const DEFAULT_JARVIS_SKIN: JarvisSkin = "singularity";
export const JARVIS_SKINS: readonly JarvisSkin[] = ["singularity", "reactor"];
```

Port methods on `PreferencesPort` (docblock: replay-current, synchronous first emission). `PreferencesSimulator`: `jarvisSkinSubject = new BehaviorSubject<JarvisSkin>(seed.jarvisSkin ?? DEFAULT_JARVIS_SKIN)` + the stream/setter pair. Each storage adapter: key const, `isJarvisSkin` guard, seeded subject, `jarvisSkin$()` with `distinctUntilChanged()`, `setJarvisSkin` writing then nexting. Export the type/consts from `packages/domain/src/index.ts`.

- [ ] **Step 4: Run.** `pnpm --filter @rtc/domain test && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-react-native test` → PASS. Also `pnpm --filter @rtc/domain build` (downstream tasks need dist).
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(domain): JarvisSkin preference (rtc-jarvis-skin) across port, simulator, 3 storage adapters"`

---

### Task 2: `speechChunks` pure math in `@rtc/motion-core`

**Files:**
- Create: `packages/motion-core/src/speechChunks.ts`
- Create: `packages/motion-core/src/speechChunks.test.ts`
- Modify: `packages/motion-core/src/index.ts` (explicit named exports)

**Interfaces:**
- Produces: `SPEECH_CHUNK_MIN_CHARS = 2`, `SPEECH_CHUNK_MAX_CHARS = 4`, `SPEECH_CHUNK_INTERVAL_MS = 26`, `speechChunks(text: string): readonly string[]`.

The prototype types replies at ~26ms per 2–4 chars. Deterministic version: cycle chunk sizes 2,3,4,2,3,4… (no randomness — pinned goldens and TestScheduler tests need determinism).

- [ ] **Step 1: Failing test** (`speechChunks.test.ts`, house style — relative import, `describe`/`it`):

```ts
import { describe, expect, it } from "vitest";
import { SPEECH_CHUNK_INTERVAL_MS, speechChunks } from "./speechChunks";

describe("speechChunks", () => {
  it("splits text into 2-4 char chunks that reassemble exactly", () => {
    const text = "EURUSD is trading at 1.0842, up 12 pips since the open.";
    const chunks = speechChunks(text);
    expect(chunks.join("")).toBe(text);
    for (const c of chunks) {
      expect(c.length).toBeGreaterThanOrEqual(1); // final chunk may be short
      expect(c.length).toBeLessThanOrEqual(4);
    }
  });

  it("is deterministic (same input, same chunks)", () => {
    expect(speechChunks("hello world")).toEqual(speechChunks("hello world"));
  });

  it("handles empty and single-char strings", () => {
    expect(speechChunks("")).toEqual([]);
    expect(speechChunks("a")).toEqual(["a"]);
  });

  it("exports the cadence constant", () => {
    expect(SPEECH_CHUNK_INTERVAL_MS).toBe(26);
  });
});
```

- [ ] **Step 2: Verify fail.** `pnpm --filter @rtc/motion-core test` → FAIL (module not found).
- [ ] **Step 3: Implement** (`speechChunks.ts`):

```ts
export const SPEECH_CHUNK_MIN_CHARS = 2;
export const SPEECH_CHUNK_MAX_CHARS = 4;
/** Cadence of the typed-out reveal (per chunk), matching the v5 prototype. */
export const SPEECH_CHUNK_INTERVAL_MS = 26;

const CYCLE = [2, 3, 4] as const;

/**
 * Split reply text into the deterministic 2/3/4-char chunk sequence the
 * scripted adapter emits as JarvisEvent deltas. Pure; the rxjs timing that
 * paces the chunks stays in the app layer (ScriptedJarvisAdapter).
 */
export function speechChunks(text: string): readonly string[] {
  const chunks: string[] = [];
  let i = 0;
  let step = 0;
  while (i < text.length) {
    const size = CYCLE[step % CYCLE.length] ?? SPEECH_CHUNK_MAX_CHARS;
    chunks.push(text.slice(i, i + size));
    i += size;
    step += 1;
  }
  return chunks;
}
```

Add to `src/index.ts`: `export { SPEECH_CHUNK_INTERVAL_MS, SPEECH_CHUNK_MAX_CHARS, SPEECH_CHUNK_MIN_CHARS, speechChunks } from "./speechChunks.js";`

- [ ] **Step 4: Run.** `pnpm --filter @rtc/motion-core test && pnpm --filter @rtc/motion-core build` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(motion-core): speechChunks — deterministic typed-reveal chunk math"`

---

### Task 3: `JarvisPort` + `JarvisMachine` in client-core

**Files:**
- Create: `packages/client-core/src/adapters/jarvisPort.ts`
- Create: `packages/client-core/src/presenters/JarvisMachine.ts`
- Create: `packages/client-core/src/presenters/__tests__/JarvisMachine.test.ts`
- Modify: `packages/client-core/src/presenters/index.ts` (alphabetical `export * from "#/presenters/JarvisMachine";`)
- Modify: `packages/client-core/src/index.ts` (`export * from "#/adapters/jarvisPort";`)

**Interfaces:**
- Consumes: `Machine<TState,TIntents>` from `#/presenters/machine`; `JarvisSkin` from `@rtc/domain` (Task 1).
- Produces (used verbatim by Tasks 4–9):

```ts
// jarvisPort.ts
import type { Observable } from "rxjs";
import type { Direction } from "@rtc/domain";

export type JarvisEvent =
  | { readonly type: "delta"; readonly text: string }
  | { readonly type: "toolEvent"; readonly tool: string; readonly status: "running" | "done" }
  | {
      readonly type: "confirmRequest";
      readonly confirmationId: string;
      readonly symbol: string;
      readonly direction: Direction;
      readonly notional: number;
      readonly quotedPrice: number;
    }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly message: string };

/**
 * Application-layer chat port (deliberately NOT in domain/ports — chat is an
 * app concern; @rtc/domain stays byte-identical in phase 1). The event union
 * mirrors what the phase-2 JARVIS_* wire messages will carry, so swapping in
 * a WsJarvisAdapter is invisible to JarvisMachine.
 */
export interface JarvisPort {
  /** Run one turn. Emits reply events; completes after "done" or "error". */
  ask(text: string): Observable<JarvisEvent>;
  /** Resolve a pending confirmRequest (approve or decline). */
  confirm(confirmationId: string, approved: boolean): void;
}
```

```ts
// JarvisMachine.ts — public surface
export const JARVIS_CONFIRM_TIMEOUT_MS = 60_000;
export const JARVIS_GREETING =
  "Good morning, sir. J.A.R.V.I.S online — all trading systems nominal. " +
  "I can quote the majors, report the movers, brief you on the desk, or execute FX orders. How may I assist?";

export type JarvisRole = "user" | "jarvis";
export interface JarvisEntry {
  readonly id: number;
  readonly role: JarvisRole;
  readonly text: string;
  /** false while deltas are still streaming into this entry */
  readonly done: boolean;
  readonly tool?: { readonly name: string; readonly status: "running" | "done" };
}
export interface JarvisConfirmation {
  readonly confirmationId: string;
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
  readonly quotedPrice: number;
  /** 1 → just requested, 0 → expired; ticks down once per second */
  readonly remainingFraction: number;
}
export interface JarvisState {
  readonly open: boolean;
  readonly skin: JarvisSkin;
  readonly unread: number;
  readonly phase: "idle" | "speaking";
  readonly entries: readonly JarvisEntry[];
  readonly pendingConfirmation: JarvisConfirmation | null;
}
export interface JarvisIntents {
  open: () => void;
  close: () => void;
  toggle: () => void;
  send: (text: string) => void;
  approveConfirmation: () => void;
  declineConfirmation: () => void;
  setSkin: (skin: JarvisSkin) => void;
}
export interface JarvisDeps {
  port: JarvisPort;
  skin$: Observable<JarvisSkin>;
  setSkin: (skin: JarvisSkin) => void;
  /** Injectable for tests; defaults to JARVIS_CONFIRM_TIMEOUT_MS. */
  confirmTimeoutMs?: number;
}
export function createJarvisMachine(deps: JarvisDeps): Machine<JarvisState, JarvisIntents>
```

**Behavioral contract** (each bullet becomes at least one test):
1. Initial state: `{ open: false, skin: <first skin$ value>, unread: 0, phase: "idle", entries: [greeting entry (done: true)], pendingConfirmation: null }`.
2. `send(text)`: appends a user entry (done: true), sets `phase: "speaking"`, calls `port.ask(text)` (turns run sequentially via `concatMap`). `delta` events accumulate into one jarvis entry (`done: false`); `toolEvent` attaches to that entry; `done` marks the entry `done: true` and returns `phase` to `"idle"`; `error` appends the message as a done jarvis entry and returns to idle.
3. `confirmRequest` sets `pendingConfirmation` with `remainingFraction: 1`; an interval (1s period, `takeUntil` resolution) folds `remainingFraction` down linearly over `confirmTimeoutMs`; at 0 the machine auto-declines (`port.confirm(id, false)`) and clears.
4. `approveConfirmation()` → `port.confirm(id, true)` + clear; `declineConfirmation()` → `port.confirm(id, false)` + clear. Both no-op when nothing pends.
5. Replies arriving while `open === false` increment `unread`; `open()`/`toggle()` to open resets `unread` to 0.
6. `setSkin(s)` calls `deps.setSkin(s)`; state `skin` follows `skin$` (the port is the source of truth — same loop as every preference).
7. `dispose()` completes all source Subjects and unsubscribes the warm subscription (copy the `TileExecutionMachine` dispose comment/ordering).

Implementation shape: intent Subjects → `merge` of patch streams (`scan((s, patch) => patch(s), INITIAL)`) → `state(stream$, initial)` → warm subscribe. Timer: `interval(1000)` inside a `switchMap` on confirmRequest patches, `takeUntil(resolution$)`. Follow `IncidentMachine`'s `Patch = (s: JarvisState) => JarvisState` fold style.

- [ ] **Step 1: Write the failing tests** (`__tests__/JarvisMachine.test.ts`, TestScheduler style — copy the `scheduler()`/`run()` helper shape from `TileExecutionMachine.test.ts`). Cover every numbered bullet above. Key excerpts:

```ts
function fakePort(ts: TestScheduler, marbles: string, values: Record<string, JarvisEvent>): JarvisPort & { confirms: Array<[string, boolean]> } {
  const confirms: Array<[string, boolean]> = [];
  return {
    confirms,
    ask: () => ts.createColdObservable<JarvisEvent>(marbles, values),
    confirm: (id, approved) => { confirms.push([id, approved]); },
  };
}

it("folds deltas into one streaming entry and closes it on done", () => {
  // marbles: "a-b-c-(d|)" with a/b/c deltas, d done
  // expect entries: [greeting, user, jarvis{text:"EUR", done:false} → …accumulated… → done:true]
  // expect phase: speaking during stream, idle after done
});

it("auto-declines the confirmation after confirmTimeoutMs", () => {
  // confirmTimeoutMs: 3000 in deps for the test; advance virtual time past it
  // expect port.confirms to end with [id, false] and pendingConfirmation null
});

it("counts unread while closed and clears on open", () => { /* bullet 5 */ });
```

- [ ] **Step 2: Verify fail.** `pnpm --filter @rtc/client-core test -- JarvisMachine` → FAIL.
- [ ] **Step 3: Implement** `jarvisPort.ts` + `JarvisMachine.ts` per the contract above. Wire barrels.
- [ ] **Step 4: Run.** `pnpm --filter @rtc/client-core test` → all PASS (including the dispose test).
- [ ] **Step 5: Commit.** `git commit -m "feat(client-core): JarvisPort event protocol + JarvisMachine (streaming fold, confirm lifecycle, unread)"`

---

### Task 4: `ScriptedJarvisAdapter` — the ported brain

**Files:**
- Create: `packages/client-core/src/adapters/jarvisIntent.ts` (pure matcher, exported for tests)
- Create: `packages/client-core/src/adapters/ScriptedJarvisAdapter.ts`
- Create: `packages/client-core/src/adapters/__tests__/jarvisIntent.test.ts`
- Create: `packages/client-core/src/adapters/__tests__/ScriptedJarvisAdapter.test.ts`
- Modify: `packages/client-core/src/index.ts` (export both)

**Interfaces:**
- Consumes: `JarvisPort`, `JarvisEvent` (Task 3); `speechChunks`, `SPEECH_CHUNK_INTERVAL_MS` (Task 2); domain use cases `PriceStreamUseCase`, `PriceHistoryUseCase`, `TradeBlotterUseCase`, `AnalyticsUseCase`, `CurrencyPairsUseCase`, `ExecuteTradeUseCase` (all exist — see `packages/domain/src/usecases/`).
- Produces:

```ts
// jarvisIntent.ts — pure; regexes ported from the v5 prototype's _jvHandle/_jvNotional
export type JarvisIntent =
  | { readonly kind: "greeting" }
  | { readonly kind: "help" }
  | { readonly kind: "pnl" }
  | { readonly kind: "movers" }
  | { readonly kind: "spread"; readonly symbol: string }
  | { readonly kind: "quote"; readonly symbol: string }
  | { readonly kind: "trade"; readonly symbol: string; readonly direction: Direction; readonly notional: number }
  | { readonly kind: "fallback" };

/** Notional parser: "5M"/"2m"/"500k"/"1.5 mio"/"million"/"thousand" → units. */
export function parseNotional(text: string): number | null;
export function matchJarvisIntent(text: string, knownSymbols: readonly string[]): JarvisIntent;
```

```ts
// ScriptedJarvisAdapter.ts
export interface ScriptedJarvisDeps {
  referenceData: ReferenceDataPort;
  pricing: PricingPort;
  blotter: BlotterPort;
  analytics: AnalyticsPort;
  execution: ExecutionPort;
  /** true → emit each reply as ONE delta (Freeze / reduced-motion / tests). */
  instantReveal$: Observable<boolean>;
}
export class ScriptedJarvisAdapter implements JarvisPort { … }
```

**Matcher rules** (from the prototype cascade, phase-1 subset, in this priority order — test each):
1. `/(brief|summar|sitrep|status report|good morning)/` → `pnl` (P1 folds "briefing" into the P&L/blotter summary; full morning briefing is P5).
2. `\b(buy|sell)\b` + a known FX symbol → `trade` (notional via `parseNotional`, default `1_000_000`).
3. `/spread/` + symbol → `spread`.
4. `/(pnl|p&l|profit|how am i doing|performance)/` → `pnl`.
5. `/(moving|movers|market|happening|action|volatil)/` → `movers`.
6. bare known symbol in the text → `quote`.
7. `/(help|what can you|capabilit)/` → `help`.
8. `/(^| )(hi|hello|hey|thanks|thank you|cheers)( |$|!|,)/` → `greeting`.
9. anything else → `fallback`.

Symbol detection: uppercase-insensitive containment of any `CurrencyPair.symbol` (e.g. "eurusd", "EUR/USD" with slash stripped).

**Reply composition** (all from live snapshots via `firstValueFrom`-equivalent `take(1)` + `timeout(2000)`; catch → error event):
- `quote`: price snapshot + history window → `"EURUSD is trading at 1.0842, up 12 pips since the start of the session. Spread 2 pips; short-term momentum is positive. Anything else, sir?"` (pips from history first→last; momentum sign from drift; emit `toolEvent {tool:"quote"}` running/done around the lookup).
- `spread`: from the price snapshot's spread field.
- `movers`: history windows for all pairs → top 3 by |pips| → `"The board, sir: GBPUSD +18 pips · EURUSD −12 pips · USDJPY +9 pips."` (`toolEvent {tool:"movers"}`).
- `pnl`: analytics snapshot + blotter snapshot → `"Session P&L stands at +$4.2k, sir. 17 FX trades on the blotter."` (`toolEvent {tool:"desk"}`).
- `trade`: price snapshot → emit `confirmRequest {confirmationId, symbol, direction, notional, quotedPrice}` (quotedPrice = ask for Buy, bid for Sell), then await `confirm()`:
  - approved → run `new ExecuteTradeUseCase(execution).execute({pair, direction, price, notional})`; report fill (`"Very good, sir. Bought 5,000,000 EUR at 1.0843 — the trade is on your blotter."`) or rejection (`"The venue rejected it, sir — nothing was executed."`).
  - declined → `"Understood, sir — standing down. Nothing was executed."`
  - The pending confirm is a `firstValueFrom` on an internal per-id `Subject<boolean>`; `confirm(id, approved)` resolves it. No adapter-side timer — the machine auto-declines at 60s (Task 3 bullet 3).
- `help`: static capability list (quotes / movers / desk P&L / FX execution; note that sentinels, widgets and drills "arrive in a later build, sir").
- `greeting`: `"At your service, sir. Markets, a desk briefing, or an execution — simply say the word."`
- `fallback`: `"I'm afraid that request is outside my current mandate, sir. I can quote the majors, report the movers, brief you on the desk, or execute FX orders."`
- Every reply text goes through the revealer: `instantReveal` false → `from(speechChunks(text)).pipe(concatMap((c) => of<JarvisEvent>({type:"delta",text:c}).pipe(delay(SPEECH_CHUNK_INTERVAL_MS))))`; true → single delta. Then `{type:"done"}`.

- [ ] **Step 1: Failing matcher tests** (`jarvisIntent.test.ts`): one `it` per rule + notional cases (`"buy 5M EURUSD"` → 5_000_000; `"sell 500k gbpusd"` → 500_000; `"buy eurusd"` → default handled by adapter, matcher returns notional 1_000_000; `"where is EURUSD?"` → quote; `"what's moving"` → movers; `"xyzzy"` → fallback; priority: `"buy 2M GBPUSD"` must be trade, not quote).
- [ ] **Step 2: Failing adapter tests** (`ScriptedJarvisAdapter.test.ts`, TestScheduler): stub ports (simulators from `@rtc/domain` or minimal fakes); assert (a) quote turn emits toolEvent running → deltas reassembling the full reply → done; (b) instantReveal → exactly one delta; (c) trade turn emits confirmRequest and, after `confirm(id,true)`, executes through a spy `ExecutionPort` and reports the fill; (d) `confirm(id,false)` → declined copy, execution NOT called; (e) snapshot timeout → error event.
- [ ] **Step 3: Verify fail, then implement** both files. Register in `src/index.ts`.
- [ ] **Step 4: Run.** `pnpm --filter @rtc/client-core test` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(client-core): ScriptedJarvisAdapter — v5 intent cascade over live domain snapshots, confirm-gated execution"`

---

### Task 5: Wire `jarvis` into `AppPorts` + composition

**Files:**
- Modify: `packages/client-core/src/adapters/portFactory.ts`
- Modify: `packages/client-core/src/composition.ts`
- Test: extend `packages/client-core/src/__tests__/composition.boot.test.ts` (or a new `composition.jarvis.test.ts`)

**Interfaces:**
- Consumes: `ScriptedJarvisAdapter` (Task 4), `createJarvisMachine` (Task 3).
- Produces: `AppPorts.jarvis: JarvisPort` (required — constructed inside BOTH `createSimulatorPorts` and `createWsRealPorts` from the ports each is already assembling, so every client in every mode gets it with zero composition-root edits; RN gets a dormant port, no UI). `Presenters.jarvis: Machine<JarvisState, JarvisIntents>`.

`instantReveal$` wiring: derive inside `portFactory` from `deps.preferences.powerSaverLevel$()` → `map((l) => l === "freeze")`. (Reduced-motion is a DOM query; the UI additionally renders instantly under reduced-motion via CSS-free full text — see Task 7 note — so the adapter only needs the Freeze signal.)

In `composition.ts`:

```ts
jarvis: createJarvisMachine({
  port: ports.jarvis,
  skin$: ports.preferences.jarvisSkin$(),
  setSkin: (s) => { ports.preferences.setJarvisSkin(s); },
}),
```

- [ ] **Step 1: Failing test.** In the composition test: `createApp(simulator ports)` → `app.presenters.jarvis.state$` first value has `entries.length === 1` (greeting) and `skin === "singularity"`; `intents.setSkin("reactor")` round-trips through the preferences port.
- [ ] **Step 2: Implement** the two files. Keep `TransportPorts` consistent (`jarvis` is not connection-scoped — include it in `TransportPorts` like `preferences`).
- [ ] **Step 3: Run.** `pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-core build && pnpm typecheck` (typecheck catches the RN/others `AppPorts` ripple — there should be none since portFactory constructs it internally).
- [ ] **Step 4: Commit.** `git commit -m "feat(client-core): jarvis port in both port factories + JarvisMachine in composition"`

---

### Task 6: `useJarvis` in both bindings

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts`
- Modify: `packages/solid-bindings/src/createViewModel.ts`
- Test: `packages/react-bindings/src/__tests__/` (mirror an existing singleton-machine test if one exists; otherwise the contract tier covers it — check `createViewModel`'s existing test layout and follow it)

**Interfaces:**
- Consumes: `Presenters.jarvis` (Task 5).
- Produces (React): `ViewModel.useJarvis: () => UseJarvisResult` where

```ts
export interface UseJarvisResult {
  state: JarvisState;           // React: plain value; Solid: Accessor<JarvisState>
  open: () => void; close: () => void; toggle: () => void;
  send: (text: string) => void;
  approveConfirmation: () => void; declineConfirmation: () => void;
  setSkin: (skin: JarvisSkin) => void;
}
```

React impl — **the eqWorkspace singleton pattern, NOT `bind()`** (the `bind()` wrapper's first render sees the default, a documented past critical bug):

```ts
useJarvis: () => {
  return {
    state: useStateObservable(presenters.jarvis.state$),
    ...presenters.jarvis.intents,
  };
},
```

Solid impl — `toSignal`:

```ts
useJarvis: () => {
  return { state: toSignal(presenters.jarvis.state$), ...presenters.jarvis.intents };
},
```

- [ ] **Step 1: Add the interface member + both impls.**
- [ ] **Step 2: Run.** `pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test && pnpm typecheck` → PASS.
- [ ] **Step 3: Commit.** `git commit -m "feat(bindings): useJarvis on both ViewModels (singleton useStateObservable/toSignal pattern)"`

---

### Task 7: React UI — orb, overlay, confirm card, hotkey

**Files:**
- Create: `packages/client-react/src/ui/shell/jarvis/JarvisOrb.tsx` + `JarvisOrb.module.css`
- Create: `packages/client-react/src/ui/shell/jarvis/JarvisOverlay.tsx` + `JarvisOverlay.module.css`
- Create: `packages/client-react/src/ui/shell/jarvis/JarvisConfirmCard.tsx` + `JarvisConfirmCard.module.css`
- Create: `packages/client-react/src/ui/shell/jarvis/useJarvisHotkey.ts`
- Modify: `packages/client-react/src/ui/shell/chrome/HeaderChrome.tsx` (add `<JarvisOrb />` to `.actions`, before `<EnvBadge />`)
- Modify: `packages/client-react/src/ui/App.tsx` (mount `<JarvisOverlay />` alongside the other fixed overlays)

**Interfaces:**
- Consumes: `useViewModel().useJarvis()` (Task 6); `countdownProgress`, `ringCircumference`, `ringDashOffset` from `@rtc/motion-core` (existing) for the confirm countdown ring.
- Produces test-ids (Tasks 9–11 depend on these exact strings): `jarvis-orb`, `jarvis-orb-badge`, `jarvis-overlay`, `jarvis-close`, `jarvis-entry` (one per message, with `data-role="user"|"jarvis"` and `data-done`), `jarvis-tool-chip`, `jarvis-suggestion` (one per chip), `jarvis-input`, `jarvis-send`, `jarvis-confirm-card`, `jarvis-confirm-approve`, `jarvis-confirm-reject`, `jarvis-skin-switch`.

**JarvisOrb** — template: `PowerSaverToggle` (32px icon-button idiom) + the `HeaderChrome` `.badge` unread pill. Structure:

```tsx
export function JarvisOrb(): ReactElement {
  const { useJarvis } = useViewModel();
  const { state, toggle } = useJarvis();
  const jarvisState =
    state.pendingConfirmation !== null ? "attention" : state.phase === "speaking" ? "speaking" : "idle";
  return (
    <button
      type="button"
      data-testid="jarvis-orb"
      data-jarvis-state={jarvisState}
      data-skin={state.skin}
      data-active={state.open ? "true" : "false"}
      aria-label="J.A.R.V.I.S assistant"
      className={styles.button}
      onClick={toggle}
    >
      <span className={styles.core} aria-hidden="true" />
      <span className={styles.glow} aria-hidden="true" />
      {state.unread > 0 && (
        <span data-testid="jarvis-orb-badge" className={styles.badge}>{state.unread}</span>
      )}
    </button>
  );
}
```

CSS (perf-checklist form): `.core`/`.glow` are stacked spans; the idle breath is ONE keyframe animating `transform: scale()` on `.core` and ONE animating `opacity` on `.glow` (pre-rendered radial-gradient background — the glow is painted once, only its opacity animates; **no animated box-shadow**), both `animation-play-state: var(--fx-play, running)`, both `@media (prefers-reduced-motion: reduce) { animation: none; }`. `[data-jarvis-state="speaking"]` swaps to a faster keyframe pair; `[data-jarvis-state="attention"]` to an urgent pulse using `var(--accent-aware)`. `[data-skin="reactor"]` recolors via custom properties consumed by the gradients (set as classes, not inline styles). Freeze needs nothing (index.css catch-all).

**useJarvisHotkey** — the `ThemePicker` document-listener idiom, mounted unconditionally:

```ts
export function useJarvisHotkey(toggle: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && (event.key === "j" || event.key === "J")) {
        event.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); };
  }, [toggle]);
}
```

**JarvisOverlay** — the `PreferencesModal` overlay pattern (early `return null` when `!state.open`; `position: fixed; inset: 0; z-index: 80;` scrim `rgba(0,0,0,0.62)`; **no backdrop-filter**). Layout: centered column `min(760px, 94vw)`; Escape closes (scoped listener like ThemePicker, active only while open). Content top-to-bottom:
1. Header row: `JARVIS` wordmark (`font-family: var(--font-logo)`), skin switch (`data-testid="jarvis-skin-switch"` — a 2-segment control cycling `JARVIS_SKINS`, active from `state.skin`, onClick `setSkin`), close `✕` (`jarvis-close`).
2. Holo core: a `div` with layered radial-gradient spans; one slow `transform: rotate` keyframe (play-state gated); `[data-skin]` recolors. Waveform: 5 bars animating `transform: scaleY()` only, rendered only while `state.phase === "speaking"` (`data-phase` on the container).
3. Message list: `state.entries` → `<div data-testid="jarvis-entry" data-role={e.role} data-done={e.done}>`; jarvis entries show `e.text` plus a blinking caret span while `!e.done` (opacity keyframe); `e.tool` renders `<span data-testid="jarvis-tool-chip" data-status={e.tool.status}>⟢ {e.tool.name}</span>`. Auto-scroll to bottom on entry growth via a `useLayoutEffect` + `scrollTop` (view-layer DOM effect — ADR-005-sanctioned).
4. `state.pendingConfirmation && <JarvisConfirmCard …/>`.
5. Suggestion chips (static UI copy, one row): `"Where is EURUSD?"`, `"What's moving?"`, `"How am I doing?"`, `"Buy 5M EURUSD"` — `data-testid="jarvis-suggestion"`, onClick sends the chip text.
6. Input row: `<input data-testid="jarvis-input">` + send button (`jarvis-send`); Enter submits; input clears on send; disabled while `phase === "speaking"`.

**JarvisConfirmCard** — props-only dumb component:

```tsx
export interface JarvisConfirmCardProps {
  confirmation: JarvisConfirmation;
  onApprove: () => void;
  onReject: () => void;
}
```

Renders pair symbol, `BUY`/`SELL` badge (`data-dir`, FX-tile colors `--accent-positive`/`--accent-negative`), formatted notional, quoted price, Approve/Reject buttons, and an SVG countdown ring driven by `ringCircumference`/`ringDashOffset(radius, confirmation.remainingFraction)` — the fraction comes from machine state (1s ticks), so no UI timer; the ring updates on state emission and a CSS `transition: stroke-dashoffset 1s linear` smooths between ticks.

- [ ] **Step 1: Build all six files** per the shapes above.
- [ ] **Step 2: Wire** `HeaderChrome` (orb in `.actions`) and `App.tsx` (`<JarvisOverlay />` next to the other overlay mounts; call `useJarvisHotkey(toggle)` inside `JarvisOverlay`'s module via a tiny `JarvisHotkey` null-component OR directly in `JarvisOverlay` before the early return — hooks must run unconditionally, so call it above `if (!state.open) return null;`).
- [ ] **Step 3: Verify by hand.** `pnpm dev` → login → orb pulses in header; ⌘J opens; "where is EURUSD?" types out a live quote; "buy 5M EURUSD" → confirm card with ticking ring → Approve → FILLED reported, trade visible in the blotter; skin switch recolors; unread badge increments when a reply lands after Escape-closing mid-turn.
- [ ] **Step 4: Gates.** `pnpm --filter @rtc/tests gates && pnpm --filter @rtc/client-react typecheck && pnpm lint` → PASS (no UI timers, no rxjs imports, no inline styles).
- [ ] **Step 5: Commit.** `git commit -m "feat(client-react): Jarvis orb + cinematic overlay + confirm card + ⌘J hotkey"`

---

### Task 8: Solid UI port

**Files:**
- Create: `packages/client-solid/src/ui/shell/jarvis/` — same five component files + `useJarvisHotkey.ts`
- Modify: `packages/client-solid/src/ui/shell/chrome/HeaderChrome.tsx`, `packages/client-solid/src/ui/App.tsx`

**Interfaces:** identical test-ids and CSS to Task 7.

Transliteration rules (the repo's established 1:1 mapping, verified on `PowerSaverToggle`/`HeaderChrome`):
- Copy every `*.module.css` **byte-identical** from client-react (CSS files are shared verbatim across the two clients — verify with `diff` after copying).
- `className=` → `class=`; `useState` → `createSignal`; `useEffect`+cleanup → `createEffect`/`onMount` + `onCleanup`; `useLayoutEffect` scroll effect → `createEffect` reading the entries signal.
- ViewModel reads become accessor calls: `state.open` → `state().open`, etc. Conditional render `{state.unread > 0 && …}` → `<Show when={state().unread > 0}>…</Show>`; lists → `<For each={state().entries}>`.
- **Solid has no early-return-null on reactive state**: `if (!state().open) return null` at setup would freeze at mount (the documented Solid trap). Use `<Show when={state().open}>` around the overlay body instead — mirror how Solid's `PreferencesModal` handles `open`.
- `useJarvisHotkey`: `onMount` + `document.addEventListener` + `onCleanup` (mounted unconditionally, NOT inside the `<Show>`).

- [ ] **Step 1: Port all files** per the rules.
- [ ] **Step 2: Verify by hand.** `pnpm dev:solid` → same six manual checks as Task 7 Step 3.
- [ ] **Step 3: Gates.** `pnpm --filter @rtc/tests gates && pnpm --filter @rtc/client-solid typecheck && pnpm lint` → PASS. `diff` each copied CSS file against its React twin → identical.
- [ ] **Step 4: Commit.** `git commit -m "feat(client-solid): Jarvis surface — Solid port at CSS/testid parity"`

---

### Task 9: Shared contract specs (swap-trio)

**Files:**
- Modify: `packages/ui-contract/src/shared/harness/world.ts` (add a controllable fake `JarvisPort`)
- Modify: `packages/ui-contract/src/shared/mount.ts` (no new seed needed if the world default suffices; add `jarvisSkin` seed only if a spec needs a non-default start)
- Create: `packages/ui-contract/src/shared/pages/shell/jarvis/JarvisOrbPage.ts`, `JarvisOverlayPage.ts`
- Modify: `packages/ui-contract/src/shared/components.ts` (export `JarvisOrb`, `JarvisOverlay` tokens)
- Create: `packages/ui-contract/src/specs/shell/jarvis/JarvisOrb.contract.spec.ts`, `JarvisOverlay.contract.spec.ts`
- Modify: `packages/client-react/tests/ui/contract/react/registry.tsx`, `viewModelFromWorld.ts`
- Modify: `packages/client-solid/tests/ui/contract/solid/registry.tsx`, `viewModelFromWorld.ts`
- Modify: `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts` — **not needed** (skin switch lives in the overlay, not the prefs modal — no prefs-modal change in P1).

**Interfaces:**
- Consumes: components + testids (Tasks 7–8), `createJarvisMachine` (Task 3).
- Produces on `World`: `world.jarvis: { port: JarvisPort; emit(events: JarvisEvent[]): void; confirms: ReadonlyArray<[string, boolean]> }` — a Subject-per-`ask` fake: each `ask()` returns a fresh replayable stream the test drives via `emit`; `confirm` records into `confirms`. The machine instance is REAL (sociable tier): `viewModelFromWorld` builds `createJarvisMachine({ port: world.jarvis.port, skin$: world's jarvisSkin subject, setSkin })` once per world, and `useJarvis` reads it exactly like production bindings do.

**Specs** (assert through page objects only; `flushSync` around intent calls):

`JarvisOrb.contract.spec.ts`:
- renders idle state (`data-jarvis-state="idle"`, no badge)
- flips to speaking while a turn streams (`world.jarvis.emit([delta])` after `page.send(…)` — or drive via overlay page; simplest: orb + overlay mounted with `mountWith(world, …)` sharing the world)
- shows attention when a confirmRequest pends
- unread badge appears for a reply while closed, clears on toggle open
- click toggles `data-active`

`JarvisOverlay.contract.spec.ts`:
- hidden until opened; open → `jarvis-overlay` present with the greeting entry
- send appends a user entry, streams deltas into one jarvis entry (`data-done="false"` → `"true"` after done event), phase returns to idle
- tool chip renders with running → done status
- confirmRequest renders the card (pair, direction badge, notional, price); approve records `[id, true]` in `world.jarvis.confirms` and clears the card; reject records `[id, false]`
- suggestion chip click sends its text (user entry appears)
- skin switch: click reactor → `data-skin="reactor"` on the core (and the setter recorded — world's preferences subject followed)
- Escape closes; input disabled while speaking

- [ ] **Step 1: World fake + pages + tokens.** Page objects extend `MountedComponent`, query via `within(this.root).queryByTestId(…)`.
- [ ] **Step 2: Write the specs; run against React** — `pnpm --filter @rtc/client-react test:ui:contract` → FAIL until registry entries exist; add the React registry entry + `viewModelFromWorld.useJarvis`; PASS.
- [ ] **Step 3: Solid half.** Add the Solid registry entry + `viewModelFromWorld.useJarvis`; `pnpm --filter @rtc/client-solid test:ui:contract` → PASS (a missing entry fails loudly with "isn't ported yet" — that's the punch-list working).
- [ ] **Step 4: Coverage gates.** `pnpm --filter @rtc/client-react test:ui:contract:coverage && pnpm --filter @rtc/client-solid test:ui:contract:coverage` → ≥95% holds (the new `src/ui/shell/jarvis/` files are in scope; add specs for any uncovered branch — the hotkey hook and scroll effect are the likely gaps; cover the hotkey by dispatching a `KeyboardEvent` on `document` inside a spec).
- [ ] **Step 5: Commit.** `git commit -m "test(ui-contract): Jarvis orb + overlay behavioural specs across both frameworks"`

---

### Task 10: Visual scenarios + goldens

**Files:**
- Modify: `packages/ui-contract/src/visual/fixtures.ts` (jarvis fixture states), `scenarios.ts`, `scenarioActions.ts`
- Modify: `packages/client-react/tests/ui/visual/react/registry.tsx` + `VisualScenario.tsx` (`FULL_BLEED` add `"JarvisOverlay"`)
- Modify: `packages/client-solid/tests/ui/visual/solid/registry.tsx` + `VisualScenario.tsx` (same)
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`, `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts` (`useJarvis` fake fed from fixture)

**Interfaces:** consumes fixture-driven `JarvisState` values; componentKeys `JarvisOrb`, `JarvisOverlay`.

Scenarios (`baseScenarios` — each auto-expands ×10 skins/modes):

```ts
"jarvis/orb-idle":        { componentKey: "JarvisOrb",     fixtureKey: "jarvis-idle" },
"jarvis/orb-attention":   { componentKey: "JarvisOrb",     fixtureKey: "jarvis-confirm" },
"jarvis/overlay-chat":    { componentKey: "JarvisOverlay", fixtureKey: "jarvis-chat" },
"jarvis/overlay-confirm": { componentKey: "JarvisOverlay", fixtureKey: "jarvis-confirm" },
```

`scenarioActions.ts`: both overlay scenarios get `{ fullPage: true }` (fixed-position viewport overlay — same treatment as `PreferencesModal`). Fixtures: `jarvis-idle` (closed, no unread), `jarvis-chat` (open, greeting + one user turn + one completed jarvis reply, entries all `done: true` — no mid-stream state in a golden), `jarvis-confirm` (open, `pendingConfirmation` with `remainingFraction: 0.75` pinned — never a live countdown in a golden). The overlay's animated core/waveform must be static in captures: waveform renders only when `phase === "speaking"` — keep fixtures `phase: "idle"`; Playwright's `animations: "disabled"` handles the core rotation.

- [ ] **Step 1: All five edit sites + both `FULL_BLEED` sets + both `buildFakeViewModel` fakes.** The guard tests (`registryCoverage.test.ts` ×2, `scenarios.test.ts`) fail loudly on any missed half — run `pnpm --filter @rtc/ui-contract test` + both clients' visual unit configs.
- [ ] **Step 2: Local goldens (Route 3).** `pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update` with `SCENARIO_PATTERN=jarvis` → writes `react-local/<platform>-<arch>` goldens. Then Solid asserts: `SCENARIO_PATTERN=jarvis pnpm --filter @rtc/client-solid test:ui:visual:playwright:solid` → PASS (pixel parity; investigate any diff as a port bug).
- [ ] **Step 3: CI goldens (Route 2).** `pnpm goldens:regen jarvis` (Docker x86, byte-identical to CI) → writes `react/`; `pnpm goldens:verify jarvis` → PASS. (If Docker is unavailable, note in the PR that the post-merge visual run needs a Route 1 dispatch — the PR's visual job stays red until `react/` regenerates; that is expected for scenario-adding PRs.)
- [ ] **Step 4: Commit** (goldens included). `git commit -m "test(visual): jarvis orb/overlay scenarios + goldens (both sets)"`

---

### Task 11: e2e smoke + final gauntlet + STATUS

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (add `jarvis` block: orb, overlay, input, send, entry, confirmApprove, confirmReject)
- Create: `tests/browser/page-objects/contracts/Jarvis.ts` (`JarvisPO` — driver-free)
- Modify: `tests/browser/page-objects/contracts/index.ts` (`jarvis: JarvisPO`)
- Create: `tests/browser/page-objects/playwright/Jarvis.ts`
- Modify: `tests/browser/page-objects/playwright/factory.ts`
- Create: `tests/browser/scenarios/jarvis.ts`
- Create: `tests/browser/playwright/jarvis.spec.ts`
- Modify: `docs/STATUS.md` (move the Jarvis entry to `## 🟡 In progress`, link this plan)

**Interfaces:**

```ts
// contracts/Jarvis.ts
export interface JarvisPO {
  openViaOrb(): Promise<void>;
  isOverlayVisible(): Promise<boolean>;
  ask(text: string): Promise<void>;
  lastReplyText(): Promise<string>;
  waitForReplyDone(): Promise<void>;      // waits data-done="true" on the last jarvis entry
  isConfirmCardVisible(): Promise<boolean>;
  approveConfirmation(): Promise<void>;
}
```

Scenario fns (`scenarios/jarvis.ts`, assertions via `./assert`, gate-5-clean): `expectQuoteReply(ctx)` (ask "Where is EURUSD?" → reply done → text contains "EURUSD is trading at"), `expectConfirmedTradeLandsInBlotter(ctx)` (count blotter rows → ask "Buy 5M EURUSD" → confirm card → approve → reply done → blotter row count increased — reuse the existing blotter PO).

Spec (`playwright/jarvis.spec.ts`, gates 9–11-clean):

```ts
import * as jarvis from "../scenarios/jarvis";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("Jarvis assistant", () => {
  withFxWorkspaceOpen();

  test("answers a quote from live desk state", async ({ ctx }) => {
    await jarvis.expectQuoteReply(ctx);
  });

  test("executes a confirm-gated trade into the blotter", async ({ ctx }) => {
    await jarvis.expectConfirmedTradeLandsInBlotter(ctx);
  });
});
```

Both clients run it automatically via `RTC_CLIENT_PKG` — zero extra config.

- [ ] **Step 1: Build the PO chain + scenarios + spec.** `pnpm --filter @rtc/tests gates` → PASS first (testid routing).
- [ ] **Step 2: Run e2e both clients.** `pnpm test:e2e` (or targeted: `RTC_DEV_PORT=3001 pnpm --filter @rtc/tests test:browser:playwright` and the `:solid` twin) → PASS.
- [ ] **Step 3: STATUS.md.** Move the Jarvis entry from 🔴 to 🟡 with "P1 built, P2 wire next"; keep both spec links + add this plan's link. `pnpm check:doc-links` → PASS.
- [ ] **Step 4: Full local gauntlet.** `/rtc:gauntlet full` (typecheck, all unit tests, both contract coverage gates, type-aware ESLint, build, biome ci) → all green.
- [ ] **Step 5: Commit.** `git commit -m "test(e2e): jarvis quote + confirm-gated trade smoke; STATUS: P1 in progress"`

---

## Verification (whole-branch, before PR)

1. `/rtc:gauntlet full` green.
2. Manual demo script on BOTH clients (`pnpm dev`, `pnpm dev:solid`): greeting types out → quote → movers → P&L → buy 5M EURUSD → confirm ring ticks → approve → fill lands in blotter → unread badge path → skin switch → ⌘J + Escape → Freeze power-saver level kills all motion and replies appear instantly (instantReveal) → reduced-motion OS setting: orb static.
3. Performance: with the overlay open and idle, record a Performance trace → zero `compositeFailed` events (orb + core animations composite-only).
4. Counterfactual check from the spec §7: confirm the diff contains zero `@rtc/domain` logic changes beyond the preference, zero `@rtc/server` changes.
