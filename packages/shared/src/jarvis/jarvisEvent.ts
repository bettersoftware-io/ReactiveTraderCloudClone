import type { Direction, JarvisBrain, JarvisEffort } from "@rtc/domain";

/**
 * Jarvis chat wire vocabulary.
 *
 * Wire rule: each turn-scoped `SERVER_MSG.JARVIS_*` payload (delta,
 * toolEvent, confirmRequest, done, error) IS the matching `JarvisEvent`
 * variant minus its `type` discriminant, PLUS a `readonly turnId: string`
 * that correlates every server event back to the client-generated turn it
 * belongs to — the message type itself carries the `type` discriminant, so
 * the payload only needs the variant's remaining fields plus `turnId`.
 * `JarvisEvent` itself stays unchanged (no `turnId` on the union) — the
 * client adapter strips `turnId` after filtering by it, so `JarvisMachine`
 * and the UIs still see the exact variant shapes below.
 * `SERVER_MSG.JARVIS_AVAILABILITY` is the one exception: it is not
 * turn-scoped (see `JarvisAvailabilityPayload`) and carries no `turnId`.
 */

export type JarvisEvent =
  | { readonly type: "delta"; readonly text: string }
  | {
      readonly type: "toolEvent";
      readonly tool: string;
      readonly status: "running" | "done";
    }
  | {
      readonly type: "confirmRequest";
      readonly confirmationId: string;
      readonly symbol: string;
      readonly direction: Direction;
      readonly notional: number;
      readonly quotedPrice: number;
      /** The pair's display precision (CurrencyPair.ratePrecision), carried so
       * the confirm card can format quotedPrice exactly like the price tiles
       * (toFixed(ratePrecision)) without a reference-data lookup UI-side. */
      readonly ratePrecision: number;
    }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly message: string };

/** One prior conversation turn the client replays for model context. */
export interface JarvisHistoryEntry {
  readonly role: "user" | "jarvis";
  readonly text: string;
}

/** `CLIENT_MSG.JARVIS_CHAT` payload — the user's chat turn. */
export interface JarvisChatPayload {
  readonly text: string;
  /** Correlates every server event of this turn; client-generated (crypto.randomUUID). */
  readonly turnId: string;
  /** Optional prior turns, oldest first, capped client-side at 20 entries. */
  readonly history?: readonly JarvisHistoryEntry[];
  /** Absent on pre-round clients — server falls back to DEFAULT_JARVIS_BRAIN. */
  readonly brain?: JarvisBrain;
  /** Absent on pre-round clients — server falls back to DEFAULT_JARVIS_EFFORT. */
  readonly effort?: JarvisEffort;
}

/** `CLIENT_MSG.JARVIS_CONFIRM` payload — resolves a pending confirmRequest. */
export interface JarvisConfirmPayload {
  readonly confirmationId: string;
  readonly approved: boolean;
}

/** `CLIENT_MSG.JARVIS_CANCEL` payload — cancels the in-flight turn identified by `turnId`. */
export interface JarvisCancelPayload {
  readonly turnId: string;
}

/** `SERVER_MSG.JARVIS_AVAILABILITY` payload — not turn-scoped; sent only in
 * reply to `CLIENT_MSG.JARVIS_SUBSCRIBE`. Availability is static per server
 * process, so there is no server-side push on change — a client re-sends
 * `JARVIS_SUBSCRIBE` (e.g. on every reconnect) to get a fresh answer. */
export interface JarvisAvailabilityPayload {
  readonly available: boolean;
  /** Absent on pre-round servers — consumers treat absent as "all offered". */
  readonly brains?: readonly JarvisBrain[];
  readonly defaultBrain?: JarvisBrain;
}
