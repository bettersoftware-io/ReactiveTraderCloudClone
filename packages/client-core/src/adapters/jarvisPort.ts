import type { Observable } from "rxjs";

import type { Direction } from "@rtc/domain";

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
