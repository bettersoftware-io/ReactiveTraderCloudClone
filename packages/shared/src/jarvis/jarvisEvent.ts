import type { Direction } from "@rtc/domain";

/**
 * Jarvis chat wire vocabulary.
 *
 * Wire rule: each `SERVER_MSG.JARVIS_*` payload IS the matching `JarvisEvent`
 * variant minus its `type` discriminant — the message type itself carries
 * the discriminant, so the payload only needs the variant's remaining
 * fields.
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

/** `CLIENT_MSG.JARVIS_CHAT` payload — the user's chat turn. */
export interface JarvisChatPayload {
  readonly text: string;
}

/** `CLIENT_MSG.JARVIS_CONFIRM` payload — resolves a pending confirmRequest. */
export interface JarvisConfirmPayload {
  readonly confirmationId: string;
  readonly approved: boolean;
}
