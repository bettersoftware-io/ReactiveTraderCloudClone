import { combineLatest, type Observable, of, shareReplay } from "rxjs";
import { map, scan } from "rxjs/operators";

import type { PanelData, PanelPoint, PanelTone } from "@rtc/core-api";
import type { PanelStreamDeps } from "@rtc/core-logic";
import {
  analyticsTableFrame,
  appendTickPoint,
  blotterTableFrame,
  type Frame,
  historySeries,
  type NamedSeries,
  renderPanelFrame,
  seriesFrame,
  unknownSourceFrame,
} from "@rtc/core-logic";
import {
  type AnalyticsPort,
  AnalyticsUseCase,
  type BlotterPort,
  type PriceTick,
  type PricingPort,
  TradeBlotterUseCase,
} from "@rtc/domain";
import type { PanelSource, PanelSpecV1 } from "@rtc/shared";

export { MAX_POINTS_PER_SERIES } from "@rtc/core-logic";

export type { PanelData, PanelPoint, PanelStreamDeps, PanelTone };

function accumulatePoints$(
  ticks$: Observable<PriceTick>,
): Observable<readonly PanelPoint[]> {
  return ticks$.pipe(scan(appendTickPoint, [] as readonly PanelPoint[]));
}

function fxTicksFrame$(
  symbols: readonly string[],
  pricing: PricingPort,
): Observable<Frame> {
  const perSymbol$ = symbols.map((symbol) => {
    return accumulatePoints$(pricing.getPriceUpdates(symbol)).pipe(
      map((points): NamedSeries => {
        return { label: symbol, points };
      }),
    );
  });

  return combineLatest(perSymbol$).pipe(map(seriesFrame));
}

function priceHistoryFrame$(
  symbols: readonly string[],
  pricing: PricingPort,
): Observable<Frame> {
  const perSymbol$ = symbols.map((symbol) => {
    return pricing.getPriceHistory(symbol).pipe(
      map((ticks) => {
        return historySeries(symbol, ticks);
      }),
    );
  });

  return combineLatest(perSymbol$).pipe(map(seriesFrame));
}

function analyticsFrame$(analytics: AnalyticsPort): Observable<Frame> {
  return new AnalyticsUseCase(analytics)
    .execute()
    .pipe(map(analyticsTableFrame));
}

function blotterFrame$(blotter: BlotterPort): Observable<Frame> {
  return new TradeBlotterUseCase(blotter)
    .execute()
    .pipe(map(blotterTableFrame));
}

function sourceFrame$(
  source: PanelSource,
  deps: PanelStreamDeps,
): Observable<Frame> {
  switch (source.kind) {
    case "fxTicks":
      return fxTicksFrame$(source.symbols, deps.pricing);
    case "priceHistory":
      return priceHistoryFrame$(source.symbols, deps.pricing);
    case "analytics":
      return analyticsFrame$(deps.analytics);
    case "blotter":
      return blotterFrame$(deps.blotter);

    default:
      return of<Frame>(unknownSourceFrame(source));
  }
}

/**
 * Interprets one `PanelSpecV1` into a live `PanelData` stream: reads
 * `spec.source` off the matching domain port, folds `spec.transforms` over it
 * in order, then renders `spec.viz`. Pure rxjs composition — no timers of its
 * own beyond whatever the source ports themselves emit on.
 *
 * TOTAL by construction: a transform that doesn't apply to what came before
 * it (e.g. `rollingVol` after a `blotter`/table source, or `topN` after a
 * `fxTicks`/series source) collapses the working frame to the internal
 * `"empty"` marker rather than throwing, and every `viz` renderer maps that
 * (or a viz that doesn't apply to what IS there) to the empty form of its own
 * `PanelData` kind — an empty series/rows/cells array, or a placeholder
 * gauge. A caller never needs to catch.
 *
 * `shareReplay({ bufferSize: 1, refCount: true })`: one subscription per
 * panel is shared across every current subscriber (so N UI readers of the
 * same panel's `data$` cost the source ports exactly one subscription), and
 * `refCount: true` tears that subscription down once the last reader
 * unsubscribes — `JarvisPanelsPresenter` relies on this to release a
 * dismissed panel's port streams (see its own doc).
 */
export function composePanelStream(
  spec: PanelSpecV1,
  deps: PanelStreamDeps,
): Observable<PanelData> {
  return sourceFrame$(spec.source, deps).pipe(
    map((frame) => {
      return renderPanelFrame(spec, frame);
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}
