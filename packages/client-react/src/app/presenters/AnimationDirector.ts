import {
  filter,
  map,
  merge,
  type Observable,
  pairwise,
  shareReplay,
  skip,
} from "rxjs";

import type { ConnectionStatus, Price } from "@rtc/domain";

// Kept local (not exported) in Phase 0: nothing outside this module consumes
// AnimationKind yet, and knip is a hard gate that bans dead exports (Task 8
// precedent: unexport until a consumer arrives). It is re-exported as part of
// the public AnimationIntent contract in Phase 3 when tiles map intents → CSS.
type AnimationKind =
  | "tickUp"
  | "tickDown"
  | "fill"
  | "reject"
  | "expiry"
  | "newRow"
  | "connectionChange";

export interface AnimationIntent {
  readonly target: string;
  readonly kind: AnimationKind;
}

export interface AnimationDirectorDeps {
  /** Per-symbol price streams (keyed by CurrencyPair.symbol). */
  readonly priceStreams: Readonly<Record<string, Observable<Price>>>;
  readonly connectionStatus$: Observable<ConnectionStatus>;
}

/**
 * Neutral app-layer presenter. Subscribes to domain streams and emits animation
 * INTENTS ({ target, kind }); NO DOM access — the dumb UI maps an intent to a
 * `data-anim` attribute / Motion One call. Phase 0 wires the price-tick and
 * connection-change sources already present; later phases extend the deps with
 * fill/expiry/newRow sources without changing the intent shape.
 */
export class AnimationDirector {
  private readonly all$: Observable<AnimationIntent>;

  constructor(deps: AnimationDirectorDeps) {
    const ticks$ = Object.entries(deps.priceStreams).map(([symbol, p$]) => {
      return p$.pipe(
        map((price) => {
          return price.mid;
        }),
        pairwise(),
        map(([prev, next]): AnimationIntent => {
          return {
            target: `tile:${symbol}`,
            kind: next >= prev ? "tickUp" : "tickDown",
          };
        }),
      );
    });

    const connection$ = deps.connectionStatus$.pipe(
      skip(1), // ignore the replayed current status; animate only real changes
      map((): AnimationIntent => {
        return { target: "banner:connection", kind: "connectionChange" };
      }),
    );

    this.all$ = merge(...ticks$, connection$).pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  intentsFor(target: string): Observable<AnimationIntent> {
    return this.all$.pipe(
      filter((intent) => {
        return intent.target === target;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
