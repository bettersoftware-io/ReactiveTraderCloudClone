# Equities Candle Backfill Paging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exchange-realistic on-demand candle history — panning near the chart's left edge fetches older pages until a finite depth is exhausted, in both web clients, in sim and WS modes.

**Architecture:** `MarketDataPort.candleHistory` (one-shot page RPC) + a simulator deep-history cache; `CandleSeriesPresenter` stitches a prepend accumulator ahead of the base stream with single-flight/exhaustion state; the gesture hooks gain a growth-direction fork (prepend translates the viewport, append still `followLive`s); thin near-edge trigger effect + two static chips per client.

**Tech Stack:** TypeScript, RxJS, ws-effects, React 19 (Compiler), SolidJS, vitest, Playwright.

Spec: [../specs/2026-07-31-equities-candle-backfill-paging-design.md](../specs/2026-07-31-equities-candle-backfill-paging-design.md)

## Global Constraints

- Constants (exact): `CANDLE_HISTORY_PAGE = 300`, `CANDLE_HISTORY_DEPTH_MAX = 3000` (total: live 300 + 9 pages), both in `packages/domain/src/equities/timeframe.ts` next to `CANDLE_HISTORY_TOTAL`.
- A SHORT page (< count, incl. empty) is the exhaustion signal — no `hasMore` field anywhere.
- **The Phase-A pin must not move**: `EquityMarketDataSimulator.pin.test.ts`'s newest-60 snapshot stays byte-identical; the whole backfill path must not touch the base `candles()` walk or its rng streams.
- The prepend-shift is a pure translation `shiftForPrepend(vp, k)` in `@rtc/motion-core`; hooks distinguish growth direction via a new `firstCandleTime` parameter; append behaviour (`followLive`, `prevLen === 0` guard) byte-identical to today.
- The near-edge trigger is ONE `useEffect`/`createEffect` per client in `CandleChart` (`viewport.start < span && !loadingOlder && !historyExhausted`); this is the only new effect — none elsewhere (the brush shells stay zero-effect).
- New testids (exact): `chart-loading-older`, `chart-history-start`. Chip copy (exact): `LOADING OLDER…` / `START OF HISTORY`. Static styling only (no animation — nothing to gate for power-saver).
- Wire ids (exact): `GET_CANDLE_HISTORY: "rpc.getCandleHistory"` (CLIENT_MSG), `CANDLE_HISTORY_RESPONSE: "rpc.getCandleHistory.response"` (SERVER_MSG).
- Handler naming by effect (`rtc/name-functions-by-effect`); function-typed props are `onX` slots. Biome mandatory braces; `.js` import extensions in domain/shared/ws-effects/motion-core (lint-enforced); Solid `*.module.css` byte-identical to React's.
- Both `ui:contract` coverage gates stay green; check PER-FILE numbers for every new/modified file, not just the aggregate.
- RN untouched (its `buildNativePorts` consumes the shared client-core port factory, which gains the method — no RN UI change).

## File Structure (whole feature)

```
packages/domain/src/equities/timeframe.ts                 MODIFY  + CANDLE_HISTORY_PAGE, CANDLE_HISTORY_DEPTH_MAX
packages/domain/src/ports/marketDataPort.ts               MODIFY  + candleHistory
packages/domain/src/ports/__contracts__/MarketDataPortContract.ts  MODIFY  + laws
packages/domain/src/simulators/EquityMarketDataSimulator.ts        MODIFY  + deep-history cache + candleHistory
packages/domain/src/simulators/EquityMarketDataSimulator.candleHistory.test.ts  CREATE
packages/shared/src/protocol/messages.ts                  MODIFY  + wire ids (+ messages.test.ts)
packages/server/src/effects/equities.effects.ts           MODIFY  + getCandleHistory$ effect (+ its test)
packages/client-core/src/adapters/portFactory.ts          MODIFY  + candleHistory rpc impl
packages/client-core/src/presenters/CandleSeriesPresenter.ts       MODIFY  stitching (+ its test)
packages/react-bindings/src/createViewModel.ts            MODIFY  + useCandleBackfill + loadOlderCandles
packages/solid-bindings/src/createViewModel.ts            MODIFY  mirror
packages/motion-core/src/chartViewport.ts                 MODIFY  + shiftForPrepend (+ test + index export)
packages/client-react/src/ui/equities/chart/useChartGestures.ts    MODIFY  growth-direction fork (+ test)
packages/client-solid/src/ui/equities/chart/createChartGestures.ts MODIFY  mirror (+ test)
packages/client-react/src/ui/equities/chart/{CandleChart,ChartPlot}.tsx        MODIFY
packages/client-react/src/ui/equities/chart/BackfillChips.tsx (+ .module.css)  CREATE
packages/client-react/src/ui/equities/chart/ChartPanel.tsx         MODIFY  join
packages/client-solid/src/ui/equities/chart/…                      mirror of the four above
packages/ui-contract/src/shared/harness/world.ts          MODIFY  fake port + scripted candleHistory
packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts  MODIFY  + chip/backfill drivers
packages/ui-contract/src/specs/equities/chart/ChartBackfill.contract.spec.ts  CREATE
packages/ui-contract/src/visual/scenarios.ts              MODIFY  + 2 scenarios
packages/client-{react,solid}/tests/ui/visual/*/EquitiesChartInteractive.visual.tsx + registries  MODIFY
tests/browser/…                                           MODIFY  e2e journey
docs/architecture/17-web-client-up-close.md, docs/STATUS.md        MODIFY
```

---

### Task 1: Domain — constants, port method, simulator deep-history cache, laws

**Files:**
- Modify: `packages/domain/src/equities/timeframe.ts`
- Modify: `packages/domain/src/ports/marketDataPort.ts`
- Modify: `packages/domain/src/simulators/EquityMarketDataSimulator.ts`
- Create: `packages/domain/src/simulators/EquityMarketDataSimulator.candleHistory.test.ts`
- Modify: `packages/domain/src/ports/__contracts__/MarketDataPortContract.ts`
- Modify: `packages/domain/src/index.ts` (export the two new constants if the file exports the existing candle constants — mirror `CANDLE_HISTORY_TOTAL`'s treatment)

**Interfaces:**
- Consumes: existing `TF_CONFIG`, `mulberry32`, `hashString`, `gbmStep`, `aggregateCandle`, `BACK_SEED_OFFSET`, `VOLUME_SEED_OFFSET`, `BASE_VOLUME`, `CANDLE_SUBSTEPS`, `CANDLE_HISTORY_TOTAL`.
- Produces (Tasks 2/3 rely on): `candleHistory(symbol: string, timeframe: CandleTimeframe, beforeTime: number, count: number): Observable<readonly Candle[]>` on `MarketDataPort` and the simulator; `CANDLE_HISTORY_PAGE = 300`; `CANDLE_HISTORY_DEPTH_MAX = 3000`.

- [ ] **Step 1: Constants** — in `timeframe.ts`, next to `CANDLE_HISTORY_TOTAL`:

```ts
/** Candles per backfill page — what the client requests per near-edge fetch. */
export const CANDLE_HISTORY_PAGE = 300;

/** Total obtainable history per (symbol, timeframe): the live
 * CANDLE_HISTORY_TOTAL plus 9 backfill pages. Requests beyond it return
 * short/empty pages — the exhaustion signal. */
export const CANDLE_HISTORY_DEPTH_MAX = 3000;
```

- [ ] **Step 2: Port method** — in `marketDataPort.ts`, after `candles`:

```ts
  /** Up to `count` candles strictly BEFORE `beforeTime`, chronological, on
   * the same bucket grid as candles(). One-shot: emits once, completes. A
   * SHORT page (fewer than count, including empty) means start-of-history —
   * page length is the exhaustion signal; there is no hasMore field. */
  candleHistory(
    symbol: string,
    timeframe: CandleTimeframe,
    beforeTime: number,
    count: number,
  ): Observable<readonly Candle[]>;
```

- [ ] **Step 3: Failing simulator tests** — `EquityMarketDataSimulator.candleHistory.test.ts`:

```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Candle } from "#/equities/candle.js";
import {
  CANDLE_HISTORY_DEPTH_MAX,
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_TOTAL,
} from "#/equities/timeframe.js";
import { EquityMarketDataSimulator } from "#/simulators/EquityMarketDataSimulator.js";

async function baseSeries(sim: EquityMarketDataSimulator): Promise<readonly Candle[]> {
  return await firstValueFrom(sim.candles("AAPL", "1D"));
}

async function page(
  sim: EquityMarketDataSimulator,
  beforeTime: number,
  count = CANDLE_HISTORY_PAGE,
): Promise<readonly Candle[]> {
  return await firstValueFrom(sim.candleHistory("AAPL", "1D", beforeTime, count));
}

describe("EquityMarketDataSimulator.candleHistory", () => {
  it("returns a full chronological page strictly before beforeTime, on the bucket grid", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const oldest = base[0] as Candle;

    const p = await page(sim, oldest.time);

    expect(p).toHaveLength(CANDLE_HISTORY_PAGE);
    const newest = p[p.length - 1] as Candle;
    const bucketMs = (base[1] as Candle).time - oldest.time;
    expect(newest.time).toBe(oldest.time - bucketMs);
    for (let i = 1; i < p.length; i++) {
      expect((p[i] as Candle).time - (p[i - 1] as Candle).time).toBe(bucketMs);
    }
  });

  it("is deterministic: identical arguments yield identical candles, in any request order", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const oldest = (base[0] as Candle).time;

    const p1 = await page(sim, oldest);
    const deeper = await page(sim, (p1[0] as Candle).time);
    const p1again = await page(sim, oldest);

    expect(p1again).toEqual(p1);
    expect(deeper[deeper.length - 1] as Candle).not.toEqual(p1[0]);
  });

  it("chains page-to-page and page-to-base: closes are continuous across every seam", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const p1 = await page(sim, (base[0] as Candle).time);
    const p2 = await page(sim, (p1[0] as Candle).time);

    // Seam gaps stay within a normal inter-candle move (the walk is
    // continuous; only the sub-1% live-anchor drift and normal volatility
    // separate adjacent closes).
    const seamGap = (a: Candle, b: Candle): number => {
      return Math.abs(a.close - b.open) / a.close;
    };
    expect(seamGap(p1[p1.length - 1] as Candle, base[0] as Candle)).toBeLessThan(0.05);
    expect(seamGap(p2[p2.length - 1] as Candle, p1[0] as Candle)).toBeLessThan(0.05);
  });

  it("caps total depth at CANDLE_HISTORY_DEPTH_MAX: the last page is short, then empty", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    let before = (base[0] as Candle).time;
    let fetched = 0;

    for (;;) {
      const p = await page(sim, before);
      fetched += p.length;

      if (p.length < CANDLE_HISTORY_PAGE) {
        break;
      }

      before = (p[0] as Candle).time;
    }

    expect(fetched).toBe(CANDLE_HISTORY_DEPTH_MAX - CANDLE_HISTORY_TOTAL);
    expect(await page(sim, before)).toEqual([]);
  });

  it("throws for an unknown symbol (same contract as candles())", async () => {
    const sim = new EquityMarketDataSimulator();

    await expect(
      firstValueFrom(sim.candleHistory("NOPE", "1D", 0, 10)),
    ).rejects.toThrow("Unknown symbol");
  });

  it("carries volume on every backfilled candle", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const p = await page(sim, (base[0] as Candle).time);

    for (const c of p) {
      expect(c.volume).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 4: Run to verify failure** — `pnpm --filter @rtc/domain test -- src/simulators/EquityMarketDataSimulator.candleHistory.test.ts` → FAIL (`candleHistory` not a function).

- [ ] **Step 5: Implement the deep-history cache** — in `EquityMarketDataSimulator.ts`. Add to the class:

```ts
  /** Deep-history cache per `symbol|timeframe`: built ONCE on first
   * candleHistory request by snapshotting `now` and walking
   * CANDLE_HISTORY_DEPTH_MAX − CANDLE_HISTORY_TOTAL buckets further back
   * from where candles()' own back walk stops, on yet another independent
   * rng stream (DEEP_SEED_OFFSET — the Phase-A pin must never move).
   * Pages are slices of this cache, which is what makes the determinism
   * and page-continuity laws hold structurally. The cache chains to the
   * base series via the same seam-rescale trick as the Phase-A back walk,
   * multiplied by the live-anchor factor the last candles() call used
   * (stored per key below); if candles() re-runs later with a new anchor
   * the seam drifts by the sub-percent price move since — the same
   * accepted gap class as the live overlay itself. */
  private readonly deepHistory = new Map<string, readonly Candle[]>();
  /** Per `symbol|timeframe`: the {unscaled oldest close, live-anchor scale}
   * of the most recent candles() emission — what the deep cache must chain
   * to. */
  private readonly baseAnchors = new Map<
    string,
    { backStartUnscaled: number; liveScale: number; oldestTime: number; bucketMs: number }
  >();
```

New module constant next to `BACK_SEED_OFFSET`:

```ts
/** Distinct rng-stream offset for the DEEP backfill walk (beyond the
 * Phase-A prepend). Far from every other offset so no stream collides —
 * the A1 pin (newest-60 byte-identical) and the Phase-A back block both
 * stay untouched. */
const DEEP_SEED_OFFSET = 15013;
```

Inside `candles()`, right before `return of(anchored …)`, record the anchor
(the ONLY change to `candles()` — no rng stream is touched):

```ts
      this.baseAnchors.set(`${symbol}|${timeframe}`, {
        backStartUnscaled: backAnchored[0]?.open ?? s.open,
        liveScale: scale,
        oldestTime: anchored[0]?.time ?? now,
        bucketMs,
      });
```

Then the method (after `candles()`):

```ts
  candleHistory(
    symbol: string,
    timeframe: CandleTimeframe,
    beforeTime: number,
    count: number,
  ): Observable<readonly Candle[]> {
    return defer(() => {
      const s = this.getState(symbol);

      if (!s) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

      const key = `${symbol}|${timeframe}`;
      const deep = this.deepHistory.get(key) ?? this.buildDeepHistory(symbol, timeframe);
      this.deepHistory.set(key, deep);

      // Slice strictly-before beforeTime, newest `count` of what qualifies.
      let end = deep.length;

      while (end > 0 && (deep[end - 1] as Candle).time >= beforeTime) {
        end--;
      }

      return of(deep.slice(Math.max(0, end - count), end));
    });
  }

  /** Walks CANDLE_HISTORY_DEPTH_MAX − CANDLE_HISTORY_TOTAL buckets further
   * into the past from the base series' oldest candle, seam-rescaled to
   * chain into it — see the deepHistory field doc. */
  private buildDeepHistory(
    symbol: string,
    timeframe: CandleTimeframe,
  ): readonly Candle[] {
    const anchor = this.baseAnchors.get(`${symbol}|${timeframe}`);

    // No candles() emission yet for this key: nothing to chain to. Build
    // the anchor by generating the base series once (subscribing our own
    // candles() — synchronous via of()) and re-reading.
    if (!anchor) {
      this.candles(symbol, timeframe).subscribe().unsubscribe();
      const built = this.baseAnchors.get(`${symbol}|${timeframe}`);

      if (!built) {
        return [];
      }

      return this.walkDeepHistory(symbol, timeframe, built);
    }

    return this.walkDeepHistory(symbol, timeframe, anchor);
  }

  private walkDeepHistory(
    symbol: string,
    timeframe: CandleTimeframe,
    anchor: {
      backStartUnscaled: number;
      liveScale: number;
      oldestTime: number;
      bucketMs: number;
    },
  ): readonly Candle[] {
    const { vol, seed } = TF_CONFIG[timeframe];
    const substepVol = vol / Math.sqrt(CANDLE_SUBSTEPS);
    const depth = CANDLE_HISTORY_DEPTH_MAX - CANDLE_HISTORY_TOTAL;
    const rngDeep = mulberry32(seed + hashString(symbol) + DEEP_SEED_OFFSET);
    const volRngDeep = mulberry32(
      seed + hashString(symbol) + DEEP_SEED_OFFSET + VOLUME_SEED_OFFSET,
    );
    let price = anchor.backStartUnscaled;
    const out: Candle[] = [];

    // Oldest-first bucket times: depth buckets ending just before oldestTime.
    for (let i = depth; i >= 1; i--) {
      const bucketTime = anchor.oldestTime - i * anchor.bucketMs;
      let candle: Candle | null = null;

      for (let sub = 0; sub < CANDLE_SUBSTEPS; sub++) {
        price = gbmStep(price, rngDeep(), substepVol);
        candle = aggregateCandle(candle, price, bucketTime, anchor.bucketMs);
      }

      const built = candle as Candle;
      const range = built.close > 0 ? (built.high - built.low) / built.close : 0;
      out.push({
        ...built,
        volume: Math.round(
          BASE_VOLUME * (0.4 + volRngDeep()) * (1 + 40 * range),
        ),
      });
    }

    // Seam-rescale so the deep block's final close chains into the base
    // series' unscaled start, then apply the base's live-anchor scale so
    // the whole block lives in the same price space the client received.
    const endClose = out.at(-1)?.close;
    const seamScale = endClose ? anchor.backStartUnscaled / endClose : 1;
    const scale = seamScale * anchor.liveScale;

    return out.map((c) => {
      return {
        time: c.time,
        open: c.open * scale,
        high: c.high * scale,
        low: c.low * scale,
        close: c.close * scale,
        volume: c.volume,
      };
    });
  }
```

Note the deep walk starts from `anchor.backStartUnscaled` and walks FORWARD
through the deep block toward the base (oldest-first) — its endpoint then
rescales onto the base's start, the identical shape to the Phase-A block.

- [ ] **Step 6: Run to verify pass** — the new suite AND the pin:
`pnpm --filter @rtc/domain test -- src/simulators/EquityMarketDataSimulator.candleHistory.test.ts src/simulators/EquityMarketDataSimulator.pin.test.ts` → all PASS (pin byte-identical).

- [ ] **Step 7: Port-contract laws** — read `MarketDataPortContract.ts` first and add, in its existing style, three laws parameterised over the port under test: (a) `candleHistory` page is chronological, strictly before `beforeTime`, ≤ count; (b) same-args determinism (two calls, `toEqual`); (c) exhaustion — a request older than everything returns `[]`. Run the contract suite: `pnpm --filter @rtc/domain test -- src/ports` → PASS.

- [ ] **Step 8: Full domain suite + commit**

```bash
pnpm --filter @rtc/domain test
git add packages/domain
git commit -m "feat(domain): candleHistory port + simulator deep-history cache (3000-candle cap)"
```

---

### Task 2: Wire ids, server effect, WS port factory, world fake

**Files:**
- Modify: `packages/shared/src/protocol/messages.ts` (+ `messages.test.ts` — read it and extend in its style)
- Modify: `packages/server/src/effects/equities.effects.ts` (+ `equities.effects.test.ts`)
- Modify: `packages/client-core/src/adapters/portFactory.ts`
- Modify: `packages/ui-contract/src/shared/harness/world.ts`

**Interfaces:**
- Consumes: Task 1's port method; existing `rpc(...)` ws-effects helper; `CandlesPayload` (extend or sibling it).
- Produces: `CLIENT_MSG.GET_CANDLE_HISTORY = "rpc.getCandleHistory"`, `SERVER_MSG.CANDLE_HISTORY_RESPONSE = "rpc.getCandleHistory.response"`; the world's fake port exposes a scripted, overridable `candleHistory` (default: empty page).

- [ ] **Step 1: Wire ids** — add `GET_CANDLE_HISTORY: "rpc.getCandleHistory",` after `GET_CANDLES` and `CANDLE_HISTORY_RESPONSE: "rpc.getCandleHistory.response",` after `CANDLES_RESPONSE`; extend `messages.test.ts` following its existing assertions (read it first).

- [ ] **Step 2: Server effect** — in `equities.effects.ts`, after `getCandles$` (payload type sibling to `CandlesPayload`):

```ts
interface CandleHistoryPayload {
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly beforeTime: number;
  readonly count: number;
}

// getCandleHistory — rpc; ack payload is the older-candles page, forwarded
// as-is. A SHORT page is the exhaustion signal (spec: no hasMore field).
const getCandleHistory$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.GET_CANDLE_HISTORY,
  SERVER_MSG.CANDLE_HISTORY_RESPONSE,
  (payload, ctx): Observable<readonly Candle[]> => {
    const { symbol, timeframe, beforeTime, count } =
      payload as CandleHistoryPayload;
    return ctx.marketData.candleHistory(symbol, timeframe, beforeTime, count);
  },
);
```

Register it wherever `getCandles$` joins the effect list (read the file's tail). Add one effect test mirroring the existing `getCandles` test's harness (read `equities.effects.test.ts` first): send the message, expect an ack whose payload equals the simulator's page.

- [ ] **Step 3: WS port factory** — in `portFactory.ts`, after `candles(...)`, the same rpc→payload→complete shape with `CLIENT_MSG.GET_CANDLE_HISTORY` and payload `{ symbol, timeframe, beforeTime, count }` (copy `candles`' body incl. the `cancelled` guard and nack error `Failed to get candle history for ${symbol}`).

- [ ] **Step 4: World fake** — in `world.ts`, find where the fake `MarketDataPort` object literal implements `candles` (near `candlesFor`, line ~574) and add:

```ts
    candleHistory(
      _symbol: string,
      _timeframe: CandleTimeframe,
      _beforeTime: number,
      _count: number,
    ): Observable<readonly Candle[]> {
      // Default: instantly exhausted (empty page). Specs that exercise
      // paging drive CandleChart directly with props (see
      // ChartBackfill.contract.spec.ts) — this default exists so mounting
      // the full app never hangs on a missing implementation.
      return of([] as readonly Candle[]);
    },
```

(match the file's local style; `of` is already imported or add it.)

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @rtc/shared test && pnpm --filter @rtc/server test
pnpm --filter @rtc/domain build && pnpm --filter @rtc/shared build
pnpm typecheck
git add packages/shared packages/server packages/client-core/src/adapters/portFactory.ts packages/ui-contract/src/shared/harness/world.ts
git commit -m "feat(wire): GET_CANDLE_HISTORY rpc — server effect + WS port factory + world fake"
```

(If `pnpm typecheck` reds OTHER MarketDataPort implementers this sweep missed, add the method there in this task — the port change's blast radius belongs here.)

---

### Task 3: `CandleSeriesPresenter` stitching

**Files:**
- Modify: `packages/client-core/src/presenters/CandleSeriesPresenter.ts`
- Modify: `packages/client-core/src/presenters/__tests__/CandleSeriesPresenter.test.ts`

**Interfaces:**
- Consumes: Task 1's `candleHistory`, `CANDLE_HISTORY_PAGE`.
- Produces (Task 4 relies on): `loadOlder(symbol: string, timeframe?: CandleTimeframe): void`; `loadingOlder$(symbol: string, timeframe?: CandleTimeframe): Observable<boolean>`; `historyExhausted$(symbol: string, timeframe?: CandleTimeframe): Observable<boolean>`; `candles$` now emits the STITCHED series.

- [ ] **Step 1: Failing tests** — extend the existing test file (read it first for its fake-port style). Cases, each with a scripted fake `MarketDataPort` whose `candleHistory` is a `vi.fn()` returning controllable observables:

```ts
// 1. stitching: candles$ emits base; after loadOlder + page delivery it
//    emits [ ...page, ...base ] (chronological).
// 2. single-flight: two loadOlder calls while the first page is pending →
//    exactly ONE candleHistory call.
// 3. short page latches exhaustion: page shorter than CANDLE_HISTORY_PAGE →
//    historyExhausted$ emits true; further loadOlder calls make NO port call.
// 4. error clears loading without latching: candleHistory errors →
//    loadingOlder$ back to false, historyExhausted$ still false, and a
//    subsequent loadOlder calls the port again.
// 5. contiguity guard: a page whose last candle's time >= the current first
//    candle's time has the overlap dropped (only strictly-older survive).
// 6. per-key independence: loadOlder for (AAPL,1D) leaves (AAPL,1W)'s
//    stitched stream and flags untouched.
// 7. beforeTime correctness: first loadOlder passes the CURRENT oldest
//    stitched candle's time; after one page, the next passes the page's
//    oldest time.
// 8. loadOlder before any candles$ emission is a no-op (no port call).
```

Write them as real vitest cases against the presenter with `firstValueFrom`/manual subscription — mirror the file's existing async style. Expected exact call: `candleHistory(symbol, timeframe, <oldest.time>, CANDLE_HISTORY_PAGE)`.

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement**:

```ts
import {
  BehaviorSubject,
  combineLatest,
  map,
  type Observable,
  of,
  shareReplay,
  tap,
} from "rxjs";

import {
  CANDLE_HISTORY_PAGE,
  type Candle,
  type CandleTimeframe,
  type MarketDataPort,
} from "@rtc/domain";

const DEFAULT_TIMEFRAME: CandleTimeframe = "1D";

/** Per-(symbol|timeframe) backfill state — see loadOlder. */
interface BackfillState {
  readonly older$: BehaviorSubject<readonly Candle[]>;
  readonly loading$: BehaviorSubject<boolean>;
  readonly exhausted$: BehaviorSubject<boolean>;
  /** Oldest→newest snapshot of the latest stitched emission's FIRST candle —
   * the beforeTime anchor for the next page. Null until candles$ has
   * emitted at least once (loadOlder no-ops until then). */
  latestFirst: Candle | null;
  inFlight: boolean;
}

export class CandleSeriesPresenter {
  private readonly candleCache = new Map<
    string,
    Observable<readonly Candle[]>
  >();
  private readonly backfill = new Map<string, BackfillState>();

  constructor(private readonly marketData: MarketDataPort) {}

  candles$(
    symbol: string,
    timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
  ): Observable<readonly Candle[]> {
    const key = `${symbol}|${timeframe}`;
    const cached = this.candleCache.get(key);

    if (cached) {
      return cached;
    }

    // (existing empty-symbol guard comment stays verbatim)
    if (!symbol) {
      const empty = of([] as readonly Candle[]);
      this.candleCache.set(key, empty);
      return empty;
    }

    const state = this.backfillState(key);
    const base$ = this.marketData.candles(symbol, timeframe);
    // Stitch the prepend accumulator AHEAD of the base stream. Each
    // emission changes exactly one side (older$ grew = prepend; base
    // emitted = live append) — the gesture hooks' growth-direction fork
    // relies on that. The filter is the contiguity guard: only candles
    // strictly older than the base's first survive (defensive — the
    // presenter itself only ever requests strictly-older pages).
    const stitched$ = combineLatest([state.older$, base$]).pipe(
      map(([older, base]) => {
        const first = base[0];

        if (older.length === 0 || !first) {
          return base;
        }

        const older2 = older.filter((c) => {
          return c.time < first.time;
        });
        return [...older2, ...base] as readonly Candle[];
      }),
      tap((series) => {
        state.latestFirst = series[0] ?? null;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.candleCache.set(key, stitched$);
    return stitched$;
  }

  /** Fetches one older page for the key and prepends it — the near-edge
   * trigger's intent. Single-flight; a no-op while a page is in flight,
   * after exhaustion, or before candles$ has ever emitted. A SHORT page
   * latches exhaustion; an error clears the in-flight flag WITHOUT
   * latching, so the next trigger retries. */
  loadOlder(
    symbol: string,
    timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
  ): void {
    const state = this.backfillState(`${symbol}|${timeframe}`);
    const anchor = state.latestFirst;

    if (state.inFlight || state.exhausted$.value || !anchor) {
      return;
    }

    state.inFlight = true;
    state.loading$.next(true);
    this.marketData
      .candleHistory(symbol, timeframe, anchor.time, CANDLE_HISTORY_PAGE)
      .subscribe({
        next: (page) => {
          if (page.length < CANDLE_HISTORY_PAGE) {
            state.exhausted$.next(true);
          }

          if (page.length > 0) {
            state.older$.next([...page, ...state.older$.value]);
          }
        },
        error: () => {
          state.inFlight = false;
          state.loading$.next(false);
        },
        complete: () => {
          state.inFlight = false;
          state.loading$.next(false);
        },
      });
  }

  loadingOlder$(
    symbol: string,
    timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
  ): Observable<boolean> {
    return this.backfillState(`${symbol}|${timeframe}`).loading$;
  }

  historyExhausted$(
    symbol: string,
    timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
  ): Observable<boolean> {
    return this.backfillState(`${symbol}|${timeframe}`).exhausted$;
  }

  private backfillState(key: string): BackfillState {
    const existing = this.backfill.get(key);

    if (existing) {
      return existing;
    }

    const created: BackfillState = {
      older$: new BehaviorSubject<readonly Candle[]>([]),
      loading$: new BehaviorSubject(false),
      exhausted$: new BehaviorSubject(false),
      latestFirst: null,
      inFlight: false,
    };
    this.backfill.set(key, created);
    return created;
  }
}
```

Careful transcription notes: `older$.next([...page, ...state.older$.value])` — the NEW page is OLDER than the accumulated pages, so it goes in front. The `next:` handler deliberately does not clear `inFlight` — `complete:` does (one-shot observable; keeps the flag symmetrical with the error path).

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @rtc/client-core test -- CandleSeriesPresenter` → all new + existing cases PASS.
- [ ] **Step 5: Commit** — `git add packages/client-core && git commit -m "feat(client-core): CandleSeriesPresenter backfill stitching (single-flight, exhaustion, retry)"`

---

### Task 4: Bindings — expose `loadOlderCandles` + flags (React and Solid)

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (+ its equities test file `createViewModel.equities.test.ts`)
- Modify: `packages/solid-bindings/src/createViewModel.ts` (+ its equities test — find the sibling file)

**Interfaces:**
- Consumes: Task 3's presenter methods.
- Produces (Task 7/8 rely on): from `useViewModel()`: `useCandleBackfill(symbol, timeframe?)` → `{ loadingOlder: boolean; historyExhausted: boolean }` (a bound stream of the combined flags, default `{ loadingOlder: false, historyExhausted: false }`), and `loadOlderCandles(symbol: string, timeframe?: CandleTimeframe): void` (a stable pre-bound command).

- [ ] **Step 1: Failing bindings tests** — in each bindings package's equities test file (read them first; they build a world/fake presenters object): assert `loadOlderCandles("AAPL", "1D")` forwards to `presenters.candleSeries.loadOlder`, and `useCandleBackfill` reflects the presenter's `loadingOlder$`/`historyExhausted$` values.
- [ ] **Step 2: Implement (React)** — next to `useCandles`:

```ts
  const [useCandleBackfill] = bind(
    (symbol: string, timeframe?: CandleTimeframe) => {
      return combineLatest([
        presenters.candleSeries.loadingOlder$(symbol, timeframe),
        presenters.candleSeries.historyExhausted$(symbol, timeframe),
      ]).pipe(
        map(([loadingOlder, historyExhausted]) => {
          return { loadingOlder, historyExhausted };
        }),
      );
    },
    { loadingOlder: false, historyExhausted: false },
  );
```

and with the pre-bound commands:

```ts
  function loadOlderCandles(
    symbol: string,
    timeframe?: CandleTimeframe,
  ): void {
    presenters.candleSeries.loadOlder(symbol, timeframe);
  }
```

Export both through the ViewModel object (find where `useCandles` and the command callbacks are returned). Mirror in solid-bindings with its local idioms (read its `useCandles` equivalent first).

- [ ] **Step 3: Verify + commit** — `pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test`; commit `feat(bindings): loadOlderCandles + useCandleBackfill in both bridges`.

---

### Task 5: motion-core `shiftForPrepend` + React gesture fork

**Files:**
- Modify: `packages/motion-core/src/chartViewport.ts` (+ `chartViewport.test.ts`, `index.ts`)
- Modify: `packages/client-react/src/ui/equities/chart/useChartGestures.ts` (+ its test)

**Interfaces:**
- Produces: `shiftForPrepend(vp: ChartViewport, prependedCount: number): ChartViewport`; `useChartGestures(seriesLen: number, defaultVisible: number, firstCandleTime?: number)` — the third parameter is NEW and optional (existing callers compile unchanged until Task 7 threads it).

- [ ] **Step 1: motion-core** — test:

```ts
describe("shiftForPrepend", () => {
  it("translates both edges by the prepended count (panned-away and at-edge alike)", () => {
    expect(shiftForPrepend({ start: 40, end: 100 }, 300)).toEqual({ start: 340, end: 400 });
    expect(shiftForPrepend({ start: 0, end: 60 }, 300)).toEqual({ start: 300, end: 360 });
  });
});
```

implementation (after `followLive`):

```ts
/** Older candles were PREPENDED (k of them): every index shifted by +k, so
 * the viewport translates with them — the view keeps showing the same
 * candles. Pure translation, no clamp: in-bounds by construction (the
 * series grew by exactly k at the front). The mirror image of followLive. */
export function shiftForPrepend(
  vp: ChartViewport,
  prependedCount: number,
): ChartViewport {
  return { start: vp.start + prependedCount, end: vp.end + prependedCount };
}
```

Export from `index.ts` (alphabetical). Run motion-core tests.

- [ ] **Step 2: React hook fork** — failing tests first (extend `useChartGestures.test.ts`; note `HookProps` gains `firstCandleTime?`):

```ts
  it("prepended candles shift a panned-away viewport so the same candles stay in view", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(props.seriesLen, DEFAULT_VISIBLE, props.firstCandleTime);
      },
      { initialProps: { seriesLen: SERIES_LEN, firstCandleTime: 1_000_000 } },
    );

    act(() => {
      result.current.plotProps.onKeyDown(keyEvent("Home"));
    });
    const panned = result.current.viewport;

    // 300 older candles arrive: first time got OLDER, length grew by 300.
    rerender({ seriesLen: SERIES_LEN + 300, firstCandleTime: 700_000 });

    expect(result.current.viewport).toEqual({
      start: panned.start + 300,
      end: panned.end + 300,
    });
    expect(result.current.atLiveEdge).toBe(false);
  });

  it("prepended candles keep an at-live-edge viewport at the edge", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(props.seriesLen, DEFAULT_VISIBLE, props.firstCandleTime);
      },
      { initialProps: { seriesLen: SERIES_LEN, firstCandleTime: 1_000_000 } },
    );

    rerender({ seriesLen: SERIES_LEN + 300, firstCandleTime: 700_000 });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN + 300 - DEFAULT_VISIBLE,
      end: SERIES_LEN + 300,
    });
    expect(result.current.atLiveEdge).toBe(true);
  });

  it("appends with an unchanged firstCandleTime still follow the live edge (regression pin)", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useChartGestures(props.seriesLen, DEFAULT_VISIBLE, props.firstCandleTime);
      },
      { initialProps: { seriesLen: SERIES_LEN, firstCandleTime: 1_000_000 } },
    );

    rerender({ seriesLen: SERIES_LEN + 5, firstCandleTime: 1_000_000 });

    expect(result.current.viewport).toEqual({
      start: SERIES_LEN - DEFAULT_VISIBLE + 5,
      end: SERIES_LEN + 5,
    });
  });
```

Implementation — the render-adjust block becomes:

```ts
  const [prevLen, setPrevLen] = useState(seriesLen);
  const [prevFirstTime, setPrevFirstTime] = useState(firstCandleTime);

  if (seriesLen !== prevLen || firstCandleTime !== prevFirstTime) {
    setPrevLen(seriesLen);
    setPrevFirstTime(firstCandleTime);
    setViewport((vp) => {
      // (existing prevLen === 0 comment stays verbatim)
      if (prevLen === 0) {
        return defaultViewport(seriesLen, defaultVisible);
      }

      // Growth DIRECTION fork: the series growing while its first candle
      // got OLDER is a backfill prepend — every index shifted, so the
      // viewport translates with them (holds a panned-away view still AND
      // keeps an at-edge view at the edge, one code path). Anything else
      // is the live append fold, unchanged.
      const grewBy = seriesLen - prevLen;
      const prepended =
        grewBy > 0 &&
        prevFirstTime !== undefined &&
        firstCandleTime !== undefined &&
        firstCandleTime < prevFirstTime;

      if (prepended) {
        return shiftForPrepend(vp, grewBy);
      }

      return followLive(vp, prevLen, seriesLen);
    });
  }
```

(signature: `export function useChartGestures(seriesLen: number, defaultVisible: number, firstCandleTime?: number): ChartGestures` — add `shiftForPrepend` to the motion-core import.) Rebuild motion-core first (`pnpm --filter @rtc/motion-core build`).

- [ ] **Step 3: Verify + commit** — `pnpm --filter @rtc/client-react test -- src/ui/equities/chart/useChartGestures.test.ts` (all old + 3 new green); commit `feat(react): growth-direction fork — prepends translate the viewport`.

---

### Task 6: Solid gesture fork (mirror of Task 5's hook half)

**Files:** `packages/client-solid/src/ui/equities/chart/createChartGestures.ts` (+ its test).

Port Task 5's three test behaviours and the fork one-for-one into the Solid factory: signature gains `firstCandleTime?: Accessor<number | undefined>` (an ACCESSOR like the other params); the `createComputed` seeds `{ len: seriesLen(), firstTime: firstCandleTime?.() }` and forks on the same predicate, calling the accessors fresh. Read the factory's existing `createComputed` (seeded-accumulator form) first and keep its shape; same expected numbers as Task 5's tests. Verify with the package's test filter; commit `feat(solid): growth-direction fork — prepends translate the viewport`.

---

### Task 7: React UI — trigger effect, chips, joins

**Files:**
- Create: `packages/client-react/src/ui/equities/chart/BackfillChips.tsx` + `BackfillChips.module.css`
- Modify: `ChartPlot.tsx`, `CandleChart.tsx`, `ChartPanel.tsx` (same dir)
- Modify: `packages/client-react/tests/ui/visual/react/EquitiesChartInteractive.visual.tsx` (ForcedChart passes the two new ChartPlot props as literals, default false)

**Interfaces:**
- Consumes: Tasks 4/5.
- Produces: `ChartPlotProps` gains `loadingOlder: boolean` and `historyStart: boolean` (REQUIRED — the visual wrappers must thread them); `CandleChartProps` gains `loadingOlder: boolean`, `historyExhausted: boolean`, `onLoadOlder: () => void` (slot).

- [ ] **Step 1: `BackfillChips.module.css`** (byte-identical copy lands in Solid in Task 8):

```css
/* Backfill status chips, pinned to the plot's LEFT edge — the BACK TO LIVE
   pill's family (same typography/radius), toned down: these are passive
   status, not a call to action. Static by design — nothing animates, so
   power-saver has nothing to gate. */
.chip {
  position: absolute;
  bottom: 8px;
  left: 8px;
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--border);
  border-radius: 3px;
  pointer-events: none;
}
```

- [ ] **Step 2: `BackfillChips.tsx`**:

```tsx
import type { ReactElement } from "react";

import styles from "./BackfillChips.module.css";

/**
 * The plot's backfill status chips, pinned to the LEFT edge: a passive
 * "LOADING OLDER…" while a history page is in flight, and the terminal
 * "START OF HISTORY" once exhaustion is reached AND the viewport sits hard
 * against index 0 (the caller computes both flags — this is a pure leaf).
 * At most one renders at a time: loading wins (a fetch can only be in
 * flight while NOT exhausted, but belt-and-braces here).
 */
export function BackfillChips({
  loadingOlder,
  historyStart,
}: BackfillChipsProps): ReactElement | null {
  if (loadingOlder) {
    return (
      <div className={styles.chip} data-testid="chart-loading-older">
        LOADING OLDER…
      </div>
    );
  }

  if (historyStart) {
    return (
      <div className={styles.chip} data-testid="chart-history-start">
        START OF HISTORY
      </div>
    );
  }

  return null;
}

export interface BackfillChipsProps {
  readonly loadingOlder: boolean;
  readonly historyStart: boolean;
}
```

- [ ] **Step 3: `ChartPlot`** — props gain `loadingOlder: boolean; historyStart: boolean`; render `<BackfillChips loadingOlder={loadingOlder} historyStart={historyStart} />` inside the plot div, after `<CrosshairOverlay …/>` (sibling of BackToLiveButton — opposite corner).

- [ ] **Step 4: `CandleChart`** — props gain `loadingOlder: boolean; historyExhausted: boolean; onLoadOlder: () => void`. Add (after the gesture destructure):

```ts
  // The near-edge fetch trigger — deliberately an EFFECT, the only one in
  // the chart shells: syncing view state (the viewport nearing the loaded
  // series' left edge) to an external data request is exactly what effects
  // are for (ADR-005), unlike the brush shells' gesture translation which
  // stays effect-free. One window of margin: fetch before the user can hit
  // the wall at normal pan speed, never fetch on an idle chart.
  const span = viewport.end - viewport.start;
  const nearLeftEdge = viewport.start < span;

  useEffect(() => {
    if (nearLeftEdge && !loadingOlder && !historyExhausted) {
      onLoadOlder();
    }
  }, [nearLeftEdge, loadingOlder, historyExhausted, onLoadOlder]);
```

thread `firstCandleTime`: `useChartGestures(candles.length, defaultVisible, candles[0]?.time)`; compute `const historyStart = historyExhausted && viewport.start === 0;` and pass `loadingOlder={loadingOlder} historyStart={historyStart}` to ChartPlot.

- [ ] **Step 5: `ChartPanel` join**:

```ts
  const { useEqWorkspace, useEquityQuote, useCandles, useCandleBackfill, useWatchlist } = useViewModel();
  const { loadOlderCandles } = useViewModel();   // ← check how commands are exposed; if they ride the same object, one destructure
  const backfill = useCandleBackfill(sel, timeframe);

  function loadOlderForSelected(): void {
    loadOlderCandles(sel, timeframe);
  }
```

and pass `loadingOlder={backfill.loadingOlder} historyExhausted={backfill.historyExhausted} onLoadOlder={loadOlderForSelected}` to `<CandleChart>`. (Read how ChartPanel currently gets commands — mirror the existing pattern exactly; the named wrapper keeps `rtc/name-functions-by-effect` satisfied.)

- [ ] **Step 6: Visual wrapper** — `ForcedChart` and the four real-`CandleChart` wrappers in `EquitiesChartInteractive.visual.tsx`: ChartPlot mounts get `loadingOlder={false} historyStart={false}`; real CandleChart mounts get `loadingOlder={false} historyExhausted={false} onLoadOlder={() => {}}`.

- [ ] **Step 7: Verify + commit** — `pnpm --filter @rtc/client-react test` all green; `pnpm typecheck`; commit `feat(react): backfill trigger + chips wired through ChartPanel/CandleChart/ChartPlot`.

---

### Task 8: Solid UI mirror

**Files:** the four Solid counterparts (`BackfillChips.tsx` new, `ChartPlot.tsx`, `CandleChart.tsx`, `ChartPanel.tsx`) + `packages/client-solid/tests/ui/visual/solid/EquitiesChartInteractive.visual.tsx` + `cp` the CSS byte-identical.

Port Task 7 with Solid idioms: `props.` access, `<Show>` chain in BackfillChips (loading wins), `createEffect` for the trigger (same guard expression, accessors called inside), `createChartGestures(..., () => props.candles[0]?.time)` threading, `ChartPanel` join mirroring its existing `useViewModel()` usage. CSS: `cp` from React then `diff` (must be empty — cssParity gate). Verify: `pnpm --filter @rtc/client-solid test` (incl. cssParity), `pnpm typecheck`. Commit `feat(solid): backfill trigger + chips (mirror)`.

---

### Task 9: ui-contract — drivers + `ChartBackfill.contract.spec.ts`

**Files:**
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts`
- Create: `packages/ui-contract/src/specs/equities/chart/ChartBackfill.contract.spec.ts`

The spec drives `CandleChart` DIRECTLY with props (the established mount) — `onLoadOlder` is a spy; pages are delivered by `setProps` with prepended fixtures, which exercises the real gesture-fork/stitch consumption path end to end without the world.

- [ ] **Step 1: Page drivers** — add to `CandleChartPage`:

```ts
  loadingOlderChip(): boolean {
    return this.root.querySelector('[data-testid="chart-loading-older"]') !== null;
  }

  historyStartChip(): boolean {
    return this.root.querySelector('[data-testid="chart-history-start"]') !== null;
  }
```

- [ ] **Step 2: The spec** — cases (use `generateCandles`/`candleAt` from `candleFixture.ts`; `olderCandles(count)` local helper generating candles with times BEFORE index 0's — negative indices via `candleAt`-style formula, e.g. `time: (i - count) * 60_000`):

```ts
// 1. idle at the live edge: onLoadOlder NOT called, no chips.
// 2. pan to the trigger (Home): onLoadOlder called; with
//    setProps({loadingOlder: true}) the LOADING OLDER… chip renders.
// 3. THE HEADLINE: capture timeLabels(); setProps({ candles: [...older300,
//    ...CANDLES], loadingOlder: false }) → timeLabels() UNCHANGED (the
//    prepend-shift held the view) and candleCount() still 60.
// 4. no re-trigger while loading: with loadingOlder: true, further ArrowLeft
//    pans call onLoadOlder no additional times.
// 5. exhaustion: setProps({ historyExhausted: true }); Home to index 0 →
//    START OF HISTORY chip renders; onLoadOlder NOT called again.
// 6. exhausted but mid-series: pan right off index 0 → chip disappears.
```

Write them fully (mount via the existing `mountChart`-style helper extended with the three new props; spy = `vi.fn()`). Numbers: `Home` from default `{240,300}` lands `{0,60}` → `start(0) < span(60)` fires the trigger.

- [ ] **Step 3: Run against BOTH clients** — `pnpm --filter @rtc/client-react test:ui:contract` and `pnpm --filter @rtc/client-solid test:ui:contract` (green); then BOTH coverage gates, reporting per-file numbers for BackfillChips/CandleChart/ChartPanel per client (backfill any uncovered branch with a targeted case). Commit `test(ui-contract): ChartBackfill spec — trigger, prepend-hold, exhaustion`.

---

### Task 10: Visual scenarios + goldens (additions only)

**Files:** `packages/ui-contract/src/visual/scenarios.ts` (+ per-client registries + `EquitiesChartInteractive.visual.tsx` in both clients).

- Two scenarios: `"equities/chart-loading-older"` → `EquitiesChartLoadingOlder`, `"equities/chart-history-start"` → `EquitiesChartHistoryStart` (fixtureKey `equities-loaded`, same comment style as the C5 block).
- Wrappers (both clients): `ForcedChart` mounts with `loadingOlder={true}` (default viewport) and `historyStart={true}` + `viewport={{ start: 0, end: 60 }}` respectively.
- Regen: `pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update`; **scope check** — with the =all mode the drift files may rewrite again: commit ONLY the 20 new files (2 stems × 10 themes), `git checkout --` the rest, mirroring the navigator precedent. Solid asserts: `pnpm --filter @rtc/client-solid test:ui:visual` fully green.
- Commit `test(visual): chart-loading-older + chart-history-start scenarios (additions only)`.

---

### Task 11: e2e journey (sim mode)

**Files:** `tests/browser/page-objects/contracts/testids.ts` (+ `EquitiesChart.ts` contract + playwright PO), `tests/browser/scenarios/equitiesChart.ts`, `tests/browser/playwright/equitiesChart.spec.ts`.

- Testids: `loadingOlder: "chart-loading-older"`, `historyStart: "chart-history-start"` under `equities.chart`.
- PO: `waitLoadingOlderVisible(timeoutMs)`, `waitLoadingOlderHidden(timeoutMs)`, `oldestTimeLabel(): Promise<string>` (first `chart-time-label` text).
- Test (append to the describe; keep bounded waits, no fixed sleeps):

```ts
  test("panning to the left edge backfills an older page", async ({ ctx }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);

    await equitiesChart.recordOldestTimeLabel(ctx, "before");
    await equitiesChart.focusPlot(ctx);
    await equitiesChart.pressHome(ctx); // scenario helper wrapping plot().press("Home")
    // The near-edge trigger fires; the chip may resolve fast in sim mode, so
    // assert the OUTCOME (older labels), not the transient chip.
    await equitiesChart.expectOldestTimeLabelOlderThanWithin(ctx, "before", 5);
  });
```

Scenario helpers: `recordOldestTimeLabel` stores into `ctx.scratch.equitiesChart` (extend its record type); `expectOldestTimeLabelOlderThanWithin` polls (`expect.poll` inside the PO or a bounded loop via existing wait helpers — read `assert.ts`/`common.ts` for the local polling idiom; do NOT invent sleeps) until the first time label parses older than the recorded one. Run the equities e2e suite for BOTH clients as Task 8 of the navigator did. Commit `test(e2e): left-edge backfill journey`.

---

### Task 12: Docs + STATUS + full gauntlet

- `docs/architecture/17-web-client-up-close.md` §17.6: a short backfill paragraph — the growth-direction fork (prepend translates, append follows), the presenter stitching seam, the one deliberate effect and why it doesn't break the zero-effect doctrine.
- `docs/STATUS.md`: DELETE the 🔴 backfill entry (pending-only page); bump `Last updated`.
- Full gauntlet (all 16 fast gates + typecheck + `pnpm test` + lint-warnings drift + type-aware eslint + both coverage gates + build + devtools-dist), fixing anything genuinely ours; sibling-worktree reds are not ours.
- Commit `docs: backfill in §17.6; STATUS close-out`.

---

## Execution notes for the controller

- Order as numbered; Tasks 5→6 and 7→8 are React→Solid mirrors; rebuild domain/shared/motion-core (`pnpm build` or targeted `--filter` builds) after Tasks 1/2/5 so downstream packages resolve new exports.
- Task 2's typecheck sweep is the port-change blast-radius net — any missed `MarketDataPort` implementer surfaces there and belongs in that task.
- Task 10 inherits the =all regen trap: commit ONLY the 20 new goldens.
- STATUS ⚪→🔴 move for the backfill entry ships in the spec+plan PR (PR 1), not in a plan task.
