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
        next: (page: readonly Candle[]) => {
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
