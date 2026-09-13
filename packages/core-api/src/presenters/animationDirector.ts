import type { Stream } from "#/stream";

export type AnimationKind =
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

/**
 * Neutral app-layer presenter. Subscribes to domain streams and emits animation
 * INTENTS ({ target, kind }); NO DOM access — the dumb UI maps an intent to a
 * `data-anim` attribute / Motion One call.
 *
 * Produces:
 * - tile:${symbol}      → tickUp / tickDown  (FX price tick, mid up/down)
 * - tile:${symbol}      → fill / reject      (FX trade execution outcome)
 * - rfq:${rfqId}        → expiry             (credit RFQ expired)
 * - rfq:${rfqId}        → fill               (credit quote accepted)
 * - banner:connection   → connectionChange   (connection-status change)
 * - ticket:${symbol}    → fill               (equity order filled)
 */
export interface AnimationDirector {
  intentsFor(target: string): Stream<AnimationIntent>;
}
