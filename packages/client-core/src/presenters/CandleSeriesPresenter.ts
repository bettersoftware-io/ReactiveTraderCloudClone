import {
  BehaviorSubject,
  combineLatest,
  defer,
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

/** M1: a candleHistory error's retry cooldown — a subsequent loadOlder
 * within this window of the last error is a no-op (rather than hammering
 * the port at render/near-edge-effect cadence, which can re-fire every
 * frame while the viewport sits at the edge). */
const ERROR_RETRY_COOLDOWN_MS = 1000;

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
  /** M1: when the last candleHistory call errored (ms, via `now()`); null
   * once cleared by a successful page. Gates loadOlder's retry cooldown. */
  lastErrorAtMs: number | null;
}

export class CandleSeriesPresenter {
  private readonly candleCache = new Map<
    string,
    Observable<readonly Candle[]>
  >();

  private readonly backfill = new Map<string, BackfillState>();

  constructor(
    private readonly marketData: MarketDataPort,
    private readonly now: () => number = () => {
      return Date.now();
    },
  ) {}

  candles$(
    symbol: string,
    timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
  ): Observable<readonly Candle[]> {
    const key = `${symbol}|${timeframe}`;
    const cached = this.candleCache.get(key);

    if (cached) {
      return cached;
    }

    // An empty symbol is the eqWorkspace machine's transient "nothing
    // selected yet" state, not an actual unknown instrument — but
    // EquityMarketDataSimulator.candles() throws synchronously for any
    // symbol it doesn't recognise (a correct, tested domain contract for a
    // genuinely unknown symbol). Guard here instead of loosening that
    // contract: an empty series is a normal, renderable UI state, so this
    // never subscribes the port for "". Belt-and-braces alongside the
    // eqWorkspace first-render fix (createViewModel.ts) — this presenter
    // should never see "" in practice, but must not crash React if it ever
    // does.
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
    // presenter itself only ever requests strictly-older pages). M2: the
    // final Map-keyed-by-time pass makes a duplicate page (e.g. two
    // in-flight loadOlder calls somehow both landing the same page)
    // structurally impossible to see twice, regardless of where the
    // duplicate entered `older$`.
    //
    // I1: wrapped in `defer` so EVERY fresh subscription cycle (the
    // downstream shareReplay's refCount teardown → a later resubscribe,
    // e.g. a symbol re-selected after being panned away from) resets this
    // key's backfill state FIRST. Without this, `older$`/`exhausted$`/
    // `latestFirst` survive the teardown while `base$` regenerates from a
    // brand-new `Date.now()` on resubscribe (a cold generator, e.g.
    // EquityMarketDataSimulator) — stitching the OLD prepended pages onto a
    // NEW base with a time GAP (violating the continuity law) while
    // `exhausted` stays wrongly latched from the previous cycle.
    // `inFlight` is deliberately left alone: an in-flight fetch from the
    // torn-down cycle still owns its own subscription and clears itself via
    // loadOlder's error/complete handlers regardless of this stream's
    // lifecycle.
    const stitched$ = defer(() => {
      state.older$.next([]);
      state.exhausted$.next(false);
      state.latestFirst = null;

      return combineLatest([state.older$, base$]).pipe(
        map(([older, base]) => {
          const first = base[0];

          if (older.length === 0 || !first) {
            return dedupeByTime(base);
          }

          const older2 = older.filter((c) => {
            return c.time < first.time;
          });
          return dedupeByTime([...older2, ...base]);
        }),
        tap((series) => {
          state.latestFirst = series[0] ?? null;
        }),
      );
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.candleCache.set(key, stitched$);
    return stitched$;
  }

  /** Fetches one older page for the key and prepends it — the near-edge
   * trigger's intent. Single-flight; a no-op while a page is in flight,
   * after exhaustion, before candles$ has ever emitted, or — M1 — within
   * ERROR_RETRY_COOLDOWN_MS of the last error (the near-edge trigger is an
   * effect that can re-fire at render cadence while the viewport sits at
   * the wall, so an unthrottled retry would hammer the port every frame). A
   * SHORT page latches exhaustion; an error clears the in-flight flag
   * WITHOUT latching, so a trigger AFTER the cooldown retries. */
  loadOlder(
    symbol: string,
    timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
  ): void {
    const state = this.backfillState(`${symbol}|${timeframe}`);
    const anchor = state.latestFirst;

    if (state.inFlight || state.exhausted$.value || !anchor) {
      return;
    }

    if (
      state.lastErrorAtMs !== null &&
      this.now() - state.lastErrorAtMs < ERROR_RETRY_COOLDOWN_MS
    ) {
      return;
    }

    state.inFlight = true;
    state.loading$.next(true);
    this.marketData
      .candleHistory(symbol, timeframe, anchor.time, CANDLE_HISTORY_PAGE)
      .subscribe({
        next: (page: readonly Candle[]) => {
          state.lastErrorAtMs = null;

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
          state.lastErrorAtMs = this.now();
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
      lastErrorAtMs: null,
    };
    this.backfill.set(key, created);
    return created;
  }
}

/** M2: collapses a candle array to at most one entry per `time`, preserving
 * the FIRST-seen position for each time (a `Map`'s `.set` on an existing key
 * updates the value without moving it) — so a duplicate page landing twice
 * in `older$` (or an overlap surviving the contiguity filter) can never
 * render twice, regardless of which copy the duplicate values differ by. */
function dedupeByTime(candles: readonly Candle[]): readonly Candle[] {
  const byTime = new Map<number, Candle>();

  for (const c of candles) {
    byTime.set(c.time, c);
  }

  return [...byTime.values()];
}
